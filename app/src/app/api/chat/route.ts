import { spawn } from "child_process";
import { resolve } from "path";
import { resolveWorkspaceContext } from "@/lib/workspace-context";

export const runtime = "nodejs";
export const maxDuration = 300;

interface EditorContext {
  activeVideo?: string;
  activeVideoPath?: string; // relative path like "raw/video.mp4" or "output/cut.mp4"
  selection?: { inSeconds: number; outSeconds: number };
  duration?: number;
  fps?: number;
  referencedFiles?: string[]; // files mentioned via @ in chat
}

export async function POST(req: Request) {
  const { message, sessionId, editorContext } = await req.json() as {
    message: string;
    sessionId?: string;
    editorContext?: EditorContext;
  };
  const workspace = await resolveWorkspaceContext(sessionId);

  if (sessionId && !workspace) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const workspaceCwd = workspace?.workspacePath;
  const claudeSessionId = workspace?.claudeSessionId;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const projectRoot = resolve(process.cwd(), "..");

      // Build workspace context for the system prompt
      const ctx = editorContext;
      const workspaceLines = [
        `## Your Workspace`,
        ``,
        `cwd: \`${workspaceCwd}\``,
        ``,
        `**All file paths for MCP tools must be absolute paths under this directory.**`,
        ``,
        `Directories:`,
        `- \`${workspaceCwd}/raw/\` — Source files (NEVER modify)`,
        `- \`${workspaceCwd}/output/\` — Rendered results`,
        `- \`${workspaceCwd}/workspace/\` — Working copies`,
        ``,
      ];

      // Add editor context so agent knows what user is looking at
      if (ctx?.activeVideo) {
        const videoPath = ctx.activeVideoPath || `raw/${ctx.activeVideo}`;
        workspaceLines.push(`## Active Video`);
        workspaceLines.push(`The user is currently viewing: **${ctx.activeVideo}**`);
        workspaceLines.push(`Full path: \`${workspaceCwd}/${videoPath}\``);
        if (ctx.duration) workspaceLines.push(`Duration: ${ctx.duration.toFixed(2)}s`);
        if (ctx.fps) workspaceLines.push(`FPS: ${ctx.fps}`);
        if (ctx.selection) {
          workspaceLines.push(`**Active selection: ${ctx.selection.inSeconds.toFixed(2)}s → ${ctx.selection.outSeconds.toFixed(2)}s** (${(ctx.selection.outSeconds - ctx.selection.inSeconds).toFixed(1)}s)`);
          workspaceLines.push(`When the user says "this", "the selection", "this part", "here" etc., they mean this time range in this video.`);
        }
        workspaceLines.push(`When the user says "the video", "das Video" etc. without specifying which one, they mean this active video.`);
        workspaceLines.push(``);
      }

      // Referenced files via @ mentions
      if (ctx?.referencedFiles?.length) {
        workspaceLines.push(`## Referenced Files`);
        workspaceLines.push(`The user explicitly referenced these files in their message:`);
        for (const f of ctx.referencedFiles) {
          workspaceLines.push(`- \`${workspaceCwd}/${f}\``);
        }
        workspaceLines.push(`Use these files for the operation the user is requesting.`);
        workspaceLines.push(``);
      }

      const workspaceInfo = workspaceLines.join("\n");

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
        resolve(projectRoot, "SYSTEM_PROMPT.md"),
        // Inject workspace paths so the agent knows where files are
        "--append-system-prompt",
        workspaceInfo,
        // Connect to FFmpeg MCP server for video editing tools
        "--mcp-config",
        resolve(projectRoot, "mcp-config.json"),
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
