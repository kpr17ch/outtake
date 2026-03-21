import { spawn } from "child_process";
import { resolve } from "path";
import { resolveWorkspaceContext } from "@/lib/workspace-context";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { message, sessionId } = await req.json();
  const workspace = await resolveWorkspaceContext(sessionId);

  if (sessionId && !workspace) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const workspaceCwd = workspace?.workspacePath;
  const claudeSessionId = workspace?.claudeSessionId;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const args = [
        "-p",
        message,
        "--output-format",
        "stream-json",
        "--dangerously-skip-permissions",
        "--model",
        "claude-opus-4-6",
        "--verbose",
        // Only load project settings (CLAUDE.md from workspace), ignore user/global settings
        "--setting-sources",
        "project",
        // Restrict tools to video-editing relevant ones
        "--tools",
        "Bash,Read,Write,Edit,Glob,Grep",
        // Disable personal skills/commands
        "--disable-slash-commands",
        // System prompt: replace entirely with Outtake-specific prompt
        "--system-prompt-file",
        resolve(process.cwd(), "../SYSTEM_PROMPT.md"),
      ];

      if (claudeSessionId) {
        args.push("--resume", claudeSessionId);
      }

      const claudeBin =
        process.env.CLAUDE_BIN || "/Users/kai.perich/.local/bin/claude";

      // Pass full env (needed for auth) but remove API key to use subscription
      const cleanEnv = { ...process.env };
      delete cleanEnv.ANTHROPIC_API_KEY;

      const proc = spawn(claudeBin, args, {
        cwd: workspaceCwd,
        env: cleanEnv,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let buffer = "";

      proc.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            JSON.parse(line);
            controller.enqueue(encoder.encode(`data: ${line}\n\n`));
          } catch {
            // skip non-JSON lines
          }
        }
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text) {
          console.error("[claude stderr]", text);
        }
      });

      proc.on("close", (code) => {
        if (buffer.trim()) {
          try {
            JSON.parse(buffer);
            controller.enqueue(encoder.encode(`data: ${buffer}\n\n`));
          } catch {
            // skip
          }
        }
        if (code !== 0) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", message: `claude exited with code ${code}` })}\n\n`
            )
          );
        }
        controller.close();
      });

      proc.on("error", (err) => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`
          )
        );
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
