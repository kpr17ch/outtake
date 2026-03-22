import { spawn } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";
import { adaptCursorAgentLine } from "@/lib/cursor-stream-adapter";
import type { SelectionRange } from "@/lib/timecode";
import { resolveWorkspaceContext } from "@/lib/workspace-context";

export const runtime = "nodejs";
export const maxDuration = 300;

interface EditorContext {
  activeVideo?: string;
  activeVideoPath?: string;
  selection?: SelectionRange;
  duration?: number;
  fps?: number;
  referencedFiles?: string[];
}

function loadSystemPrompt(projectRoot: string): string {
  const path = resolve(projectRoot, "SYSTEM_PROMPT.md");
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
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
  if (!workspace?.workspacePath) {
    return Response.json({ error: "Workspace unavailable" }, { status: 500 });
  }

  const workspaceCwd = workspace.workspacePath;
  const agentSessionId = workspace?.claudeSessionId;

  const encoder = new TextEncoder();
  const backend = (process.env.OUTTAKE_AGENT_BACKEND || "cursor").toLowerCase();

  const stream = new ReadableStream({
    start(controller) {
      const projectRoot = resolve(process.cwd(), "..");
      const ctx = editorContext;

      const workspaceLines = [
        `## Your Workspace`,
        ``,
        `Workspace: \`${workspaceCwd}\``,
        `Project root: \`${projectRoot}\``,
        ``,
        `**All file paths for MCP tools must be absolute paths under the workspace.**`,
        ``,
        `Directories:`,
        `- \`${workspaceCwd}/input/\` — Source files uploaded by the user (NEVER modify originals)`,
        `- \`${workspaceCwd}/output/\` — ALL results go here (cuts, renders, subtitles, motion graphics, generated videos, SFX)`,
        ``,
        `**IMPORTANT: Always save output files to \`${workspaceCwd}/output/\`. Never save results outside the workspace.**`,
        ``,
        `## Running Skills`,
        ``,
        `Skills and pipelines are at the project root. Always use absolute paths:`,
        `- Transcription: \`node ${projectRoot}/transcribe-pipeline.mjs --video <abs_path> --jobId <id>\``,
        `- Remotion render: \`cd ${projectRoot} && npx remotion render src/index.ts <CompositionId> ${workspaceCwd}/output/<name>.mp4\``,
        `- Video generation: \`python ${projectRoot}/skills/video-gen/scripts/generate_video.py -o ${workspaceCwd}/output/<name>.mp4\``,
        `- Copy input videos to \`${projectRoot}/public/\` before Remotion rendering (Remotion needs them in public/)`,
        `- Transcription artifacts land in \`${projectRoot}/public/jobs/<jobId>/\` — reference them in Remotion props`,
        ``,
      ];

      if (ctx?.activeVideo) {
        const videoPath = ctx.activeVideoPath || `input/${ctx.activeVideo}`;
        workspaceLines.push(`## Active Video`);
        workspaceLines.push(`The user is currently viewing: **${ctx.activeVideo}**`);
        workspaceLines.push(`Full path: \`${workspaceCwd}/${videoPath}\``);
        if (ctx.duration) workspaceLines.push(`Duration: ${ctx.duration.toFixed(2)}s`);
        if (ctx.fps) workspaceLines.push(`FPS: ${ctx.fps}`);
        if (ctx.selection) {
          workspaceLines.push(`## Active Selection`);
          workspaceLines.push(`This UI selection is authoritative for frame-accurate edits unless the user explicitly overrides it.`);
          workspaceLines.push(`Use these exact boundaries for cuts, animations, and timing-sensitive effects:`);
          workspaceLines.push("```json");
          workspaceLines.push(JSON.stringify({
            inFrame: ctx.selection.inFrame,
            outFrame: ctx.selection.outFrame,
            inSeconds: Number(ctx.selection.inSeconds.toFixed(6)),
            outSeconds: Number(ctx.selection.outSeconds.toFixed(6)),
            timecodeIn: ctx.selection.timecodeIn,
            timecodeOut: ctx.selection.timecodeOut,
            durationFrames: ctx.selection.durationFrames,
            durationSeconds: Number(ctx.selection.durationSeconds.toFixed(6)),
            fps: ctx.selection.fps,
          }, null, 2));
          workspaceLines.push("```");
          workspaceLines.push(`When the user says "this", "the selection", "this part", or "here", they mean this exact range.`);
          workspaceLines.push(`Do not infer alternate timestamps from transcript text when this selection is present.`);
        }
        workspaceLines.push(
          `When the user says "the video", "das Video" etc. without specifying which one, they mean this active video.`
        );
        workspaceLines.push(``);
      }

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

      let bin: string;
      let args: string[];
      let env: NodeJS.ProcessEnv;

      if (backend === "claude") {
        args = [
          "-p",
          message,
          "--output-format",
          "stream-json",
          "--dangerously-skip-permissions",
          "--model",
          process.env.CLAUDE_MODEL || "claude-opus-4-6",
          "--verbose",
          "--setting-sources",
          "project",
          "--tools",
          "Bash,Read,Write,Edit,Glob,Grep",
          "--disable-slash-commands",
          "--system-prompt-file",
          resolve(projectRoot, "SYSTEM_PROMPT.md"),
          "--append-system-prompt",
          workspaceInfo,
          "--mcp-config",
          resolve(projectRoot, "mcp-config.json"),
        ];
        if (agentSessionId) {
          args.push("--resume", agentSessionId);
        }
        bin = process.env.CLAUDE_BIN || "claude";
        env = { ...process.env };
        delete env.ANTHROPIC_API_KEY;
      } else {
        const systemBody = loadSystemPrompt(projectRoot);
        const composedPrompt = [
          systemBody.trim(),
          workspaceInfo,
          `---`,
          `User message:`,
          message.trim(),
        ]
          .filter(Boolean)
          .join("\n\n");

        args = [
          "-p",
          composedPrompt,
          "--output-format",
          "stream-json",
          "--force",
          "--approve-mcps",
          "--workspace",
          workspaceCwd,
        ];
        const model = process.env.CURSOR_AGENT_MODEL?.trim();
        if (model) {
          args.push("--model", model);
        }
        if (agentSessionId) {
          args.push("--resume", agentSessionId);
        }
        bin = process.env.CURSOR_AGENT_BIN || "agent";
        env = { ...process.env };
      }

      const enqueueAdaptedLine = (line: string) => {
        const outs =
          backend === "cursor" ? adaptCursorAgentLine(line) : [line];
        for (const out of outs) {
          if (!out.trim()) continue;
          try {
            JSON.parse(out);
            controller.enqueue(encoder.encode(`data: ${out}\n\n`));
          } catch {
            // skip non-JSON
          }
        }
      };

      const proc = spawn(bin, args, {
        cwd: workspaceCwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let buffer = "";
      let lastStderr = "";
      const logLabel = backend === "claude" ? "claude" : "cursor-agent";

      proc.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            JSON.parse(line);
            enqueueAdaptedLine(line);
          } catch {
            // skip non-JSON lines
          }
        }
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text) {
          lastStderr = text;
          console.error(`[${logLabel} stderr]`, text);
        }
      });

      proc.on("close", (code) => {
        if (buffer.trim()) {
          try {
            JSON.parse(buffer);
            enqueueAdaptedLine(buffer);
          } catch {
            // skip
          }
        }
        if (code !== 0) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                message: lastStderr || `${logLabel} exited with code ${code}`,
              })}\n\n`
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
