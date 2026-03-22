import { execFile } from "child_process";
import { promisify } from "util";
import { resolveWorkspaceContext } from "@/lib/workspace-context";
import { resolveWorkspaceEntryPath } from "@/lib/workspace-server";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

function parseRate(raw?: string): number | null {
  if (!raw) {
    return null;
  }

  const [num, den] = raw.split("/").map(Number);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) {
    return null;
  }

  const fps = num / den;
  if (!Number.isFinite(fps) || fps <= 0) {
    return null;
  }

  return fps;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  const relativePath = url.searchParams.get("path");
  const workspace = await resolveWorkspaceContext(sessionId);

  if (sessionId && !workspace) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  if (!workspace || !relativePath) {
    return Response.json({ error: "Missing workspace or path" }, { status: 400 });
  }

  const filePath = resolveWorkspaceEntryPath(workspace.workspacePath, relativePath);
  if (!filePath) {
    return Response.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ]);

    const probe = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: Array<{
        codec_type?: string;
        avg_frame_rate?: string;
        r_frame_rate?: string;
        nb_frames?: string;
        width?: number;
        height?: number;
        duration?: string;
      }>;
    };

    const videoStream = probe.streams?.find((stream) => stream.codec_type === "video");
    if (!videoStream) {
      return Response.json({ error: "No video stream found" }, { status: 404 });
    }

    const fps =
      parseRate(videoStream.avg_frame_rate) ??
      parseRate(videoStream.r_frame_rate) ??
      null;

    const durationSeconds =
      Number(probe.format?.duration) ||
      Number(videoStream.duration) ||
      null;

    const durationFrames =
      Number(videoStream.nb_frames) ||
      (fps && durationSeconds ? Math.round(durationSeconds * fps) : null);

    return Response.json({
      path: relativePath,
      fps,
      durationSeconds,
      durationFrames,
      width: videoStream.width ?? null,
      height: videoStream.height ?? null,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to probe media",
      },
      { status: 500 }
    );
  }
}
