import { getSession } from "@/lib/sessions";
import {
  ensureWorkspaceStructure,
  getDefaultWorkspacePath,
} from "@/lib/workspace-server";

export interface WorkspaceContext {
  sessionId: string | null;
  workspacePath: string;
  agentSessionId?: string;
}

export async function resolveWorkspaceContext(
  sessionId?: string | null
): Promise<WorkspaceContext | null> {
  if (!sessionId) {
    const workspacePath = getDefaultWorkspacePath();
    await ensureWorkspaceStructure(workspacePath);

    return {
      sessionId: null,
      workspacePath,
    };
  }

  const session = await getSession(sessionId);
  if (!session) {
    return null;
  }

  await ensureWorkspaceStructure(session.workspacePath);

  return {
    sessionId: session.id,
    workspacePath: session.workspacePath,
    agentSessionId: session.agentSessionId,
  };
}
