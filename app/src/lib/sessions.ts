import { readFile, writeFile, readdir, mkdir, rm, rename } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import {
  SESSIONS_ROOT,
  ensureWorkspaceStructure,
  getSessionWorkspacePath,
} from "@/lib/workspace-server";

export interface SessionData {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  claudeSessionId?: string;
  workspacePath: string;
}

const SESSIONS_DIR = SESSIONS_ROOT;
const sessionWriteChains = new Map<string, Promise<void>>();

function sessionFilePath(id: string): string {
  return join(SESSIONS_DIR, id, "session.json");
}

function sessionWorkspacePath(id: string): string {
  return getSessionWorkspacePath(id);
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

  const sessionDir = join(SESSIONS_DIR, id);
  await mkdir(sessionDir, { recursive: true });
  await ensureWorkspaceStructure(workspacePath);
  await writeSessionFile(id, session);
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
      const parsed = await parseSessionData(entry.name, data);
      if (parsed) {
        sessions.push(parsed);
      }
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
    return parseSessionData(id, data);
  } catch {
    return null;
  }
}

export async function updateSession(
  id: string,
  updates: Partial<Pick<SessionData, "title" | "claudeSessionId">>
): Promise<SessionData | null> {
  return enqueueSessionWrite(id, async () => {
    const session = await getSession(id);
    if (!session) return null;

    const updated: SessionData = {
      ...session,
      ...updates,
      workspacePath: sessionWorkspacePath(id),
      updatedAt: new Date().toISOString(),
    };

    await writeSessionFile(id, updated);
    return updated;
  });
}

export async function deleteSession(id: string): Promise<boolean> {
  const sessionDir = join(SESSIONS_DIR, id);
  if (!existsSync(sessionDir)) return false;

  await rm(sessionDir, { recursive: true, force: true });
  return true;
}

function enqueueSessionWrite<T>(
  id: string,
  task: () => Promise<T>
): Promise<T> {
  const previous = sessionWriteChains.get(id) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  const settled = next.then(
    () => undefined,
    () => undefined
  );

  sessionWriteChains.set(id, settled);

  return next.finally(() => {
    if (sessionWriteChains.get(id) === settled) {
      sessionWriteChains.delete(id);
    }
  });
}

async function writeSessionFile(id: string, session: SessionData): Promise<void> {
  const filePath = sessionFilePath(id);
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const payload = JSON.stringify(session, null, 2);

  await writeFile(tempPath, payload);
  await rename(tempPath, filePath);
}

async function parseSessionData(
  id: string,
  raw: string
): Promise<SessionData | null> {
  let repaired = false;
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    const repairedRaw = repairSessionJson(raw);
    if (!repairedRaw) {
      return null;
    }

    try {
      parsed = JSON.parse(repairedRaw);
      repaired = true;
    } catch {
      return null;
    }
  }

  const session = normalizeSessionData(id, parsed);
  if (!session) {
    return null;
  }

  await ensureWorkspaceStructure(session.workspacePath);

  if (repaired) {
    await writeSessionFile(id, session);
  }

  return session;
}

function normalizeSessionData(id: string, parsed: unknown): SessionData | null {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const now = new Date().toISOString();
  const claudeSessionId =
    typeof record.claudeSessionId === "string" && record.claudeSessionId
      ? record.claudeSessionId
      : undefined;

  return {
    id,
    title:
      typeof record.title === "string" && record.title.trim()
        ? record.title
        : "New Session",
    createdAt:
      typeof record.createdAt === "string" && record.createdAt
        ? record.createdAt
        : now,
    updatedAt:
      typeof record.updatedAt === "string" && record.updatedAt
        ? record.updatedAt
        : now,
    claudeSessionId,
    workspacePath: sessionWorkspacePath(id),
  };
}

function repairSessionJson(raw: string): string | null {
  const repaired = raw.replace(/}\s*(?="[^"]+"\s*:)/, ",");

  if (repaired === raw) {
    return null;
  }

  return repaired;
}
