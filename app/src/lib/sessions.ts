import { readFile, writeFile, readdir, mkdir, rm } from "fs/promises";
import { resolve, join } from "path";
import { existsSync } from "fs";

export interface SessionData {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  claudeSessionId?: string;
  workspacePath: string;
}

const SESSIONS_DIR = resolve(process.cwd(), "../sessions");

const WORKSPACE_SUBDIRS = [
  "raw",
  "workspace",
  "output",
  "assets",
  "transcripts",
  "plans",
];

function sessionFilePath(id: string): string {
  return join(SESSIONS_DIR, id, "session.json");
}

function sessionWorkspacePath(id: string): string {
  return join(SESSIONS_DIR, id, "workspace");
}

async function ensureSessionsDir(): Promise<void> {
  if (!existsSync(SESSIONS_DIR)) {
    await mkdir(SESSIONS_DIR, { recursive: true });
  }
}

export async function createSession(
  title: string = "New Session"
): Promise<SessionData> {
  await ensureSessionsDir();

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const workspacePath = sessionWorkspacePath(id);

  const session: SessionData = {
    id,
    title,
    createdAt: now,
    updatedAt: now,
    workspacePath,
  };

  // Create session directory and workspace subdirs
  const sessionDir = join(SESSIONS_DIR, id);
  await mkdir(sessionDir, { recursive: true });

  for (const sub of WORKSPACE_SUBDIRS) {
    await mkdir(join(workspacePath, sub), { recursive: true });
  }

  await writeFile(sessionFilePath(id), JSON.stringify(session, null, 2));
  return session;
}

export async function listSessions(): Promise<SessionData[]> {
  await ensureSessionsDir();

  const entries = await readdir(SESSIONS_DIR, { withFileTypes: true });
  const sessions: SessionData[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const data = await readFile(
        join(SESSIONS_DIR, entry.name, "session.json"),
        "utf-8"
      );
      sessions.push(JSON.parse(data));
    } catch {
      // skip invalid session dirs
    }
  }

  // Sort by updatedAt descending
  sessions.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return sessions;
}

export async function getSession(id: string): Promise<SessionData | null> {
  try {
    const data = await readFile(sessionFilePath(id), "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function updateSession(
  id: string,
  updates: Partial<Pick<SessionData, "title" | "claudeSessionId">>
): Promise<SessionData | null> {
  const session = await getSession(id);
  if (!session) return null;

  const updated: SessionData = {
    ...session,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await writeFile(sessionFilePath(id), JSON.stringify(updated, null, 2));
  return updated;
}

export async function deleteSession(id: string): Promise<boolean> {
  const sessionDir = join(SESSIONS_DIR, id);
  if (!existsSync(sessionDir)) return false;

  await rm(sessionDir, { recursive: true, force: true });
  return true;
}
