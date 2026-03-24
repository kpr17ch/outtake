from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from backend.services.sessions import get_session
from backend.services.workspace import ensure_workspace_structure, get_default_workspace_path


@dataclass
class WorkspaceContext:
    session_id: str | None
    workspace_path: Path
    agent_session_id: str | None = None


def resolve_workspace_context(session_id: str | None) -> WorkspaceContext | None:
    if not session_id:
        workspace_path = get_default_workspace_path()
        ensure_workspace_structure(workspace_path)
        return WorkspaceContext(session_id=None, workspace_path=workspace_path, agent_session_id=None)

    session = get_session(session_id)
    if not session:
        return None

    workspace_path = Path(session.workspacePath)
    ensure_workspace_structure(workspace_path)
    return WorkspaceContext(
        session_id=session.id,
        workspace_path=workspace_path,
        agent_session_id=session.agentSessionId,
    )
