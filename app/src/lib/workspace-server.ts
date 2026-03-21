import { mkdir } from "fs/promises";
import { extname, join, normalize, resolve } from "path";

export const WORKSPACE_SUBDIRS = [
  "input",
  "output",
] as const;

export const SESSIONS_ROOT = resolve(process.cwd(), "../sessions");
const DEFAULT_WORKSPACE_ROOT = resolve(process.cwd(), "../workspace");

const MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
  ".json": "application/json",
  ".txt": "text/plain",
  ".srt": "text/plain",
  ".md": "text/plain",
};

export function getDefaultWorkspacePath(): string {
  if (process.env.OUTTAKE_CWD) {
    return resolve(process.env.OUTTAKE_CWD);
  }

  return DEFAULT_WORKSPACE_ROOT;
}

export function getSessionWorkspacePath(sessionId: string): string {
  return join(SESSIONS_ROOT, sessionId, "workspace");
}

export async function ensureWorkspaceStructure(workspacePath: string): Promise<void> {
  await mkdir(workspacePath, { recursive: true });

  for (const subdir of WORKSPACE_SUBDIRS) {
    await mkdir(join(workspacePath, subdir), { recursive: true });
  }
}

export function getMimeType(filename: string): string {
  return MIME_TYPES[extname(filename).toLowerCase()] || "application/octet-stream";
}

export function sanitizeUploadedFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function resolveWorkspaceEntryPath(
  workspacePath: string,
  relativePath: string = ""
): string | null {
  const root = normalize(workspacePath);
  const fullPath = normalize(resolve(root, relativePath));

  if (fullPath === root || fullPath.startsWith(`${root}/`)) {
    return fullPath;
  }

  return null;
}
