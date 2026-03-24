from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from uuid import uuid4

from backend.services.workspace import SESSIONS_ROOT, ensure_workspace_structure, get_session_workspace_path


@dataclass
class SessionData:
    id: str
    title: str
    createdAt: str
    updatedAt: str
    workspacePath: str
    agentSessionId: str | None = None


_session_locks: dict[str, Lock] = {}


def _session_lock(session_id: str) -> Lock:
    lock = _session_locks.get(session_id)
    if lock is None:
        lock = Lock()
        _session_locks[session_id] = lock
    return lock


def _session_file_path(session_id: str) -> Path:
    return SESSIONS_ROOT / session_id / "session.json"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_sessions_dir() -> None:
    SESSIONS_ROOT.mkdir(parents=True, exist_ok=True)


def create_session(title: str = "New Session") -> SessionData:
    ensure_sessions_dir()
    sid = str(uuid4())
    now = _now()
    workspace_path = get_session_workspace_path(sid)
    session = SessionData(
        id=sid,
        title=title,
        createdAt=now,
        updatedAt=now,
        workspacePath=str(workspace_path),
        agentSessionId=None,
    )
    (SESSIONS_ROOT / sid).mkdir(parents=True, exist_ok=True)
    ensure_workspace_structure(workspace_path)
    write_session_file(session)
    return session


def write_session_file(session: SessionData) -> None:
    path = _session_file_path(session.id)
    tmp = path.with_suffix(f".{uuid4().hex}.tmp")
    tmp.write_text(json.dumps(asdict(session), indent=2), encoding="utf-8")
    tmp.replace(path)


def normalize_session_data(session_id: str, parsed: dict) -> SessionData:
    now = _now()
    workspace_path = get_session_workspace_path(session_id)
    return SessionData(
        id=session_id,
        title=parsed.get("title") if isinstance(parsed.get("title"), str) and parsed.get("title").strip() else "New Session",
        createdAt=parsed.get("createdAt") if isinstance(parsed.get("createdAt"), str) else now,
        updatedAt=parsed.get("updatedAt") if isinstance(parsed.get("updatedAt"), str) else now,
        workspacePath=str(workspace_path),
        agentSessionId=parsed.get("agentSessionId") if isinstance(parsed.get("agentSessionId"), str) else None,
    )


def get_session(session_id: str) -> SessionData | None:
    try:
        raw = _session_file_path(session_id).read_text(encoding="utf-8")
        parsed = json.loads(raw)
        session = normalize_session_data(session_id, parsed if isinstance(parsed, dict) else {})
        ensure_workspace_structure(Path(session.workspacePath))
        return session
    except Exception:
        return None


def list_sessions() -> list[SessionData]:
    ensure_sessions_dir()
    sessions: list[SessionData] = []
    for entry in SESSIONS_ROOT.iterdir():
        if not entry.is_dir():
            continue
        session = get_session(entry.name)
        if session:
            sessions.append(session)
    sessions.sort(key=lambda s: s.updatedAt, reverse=True)
    return sessions


def update_session(session_id: str, updates: dict) -> SessionData | None:
    lock = _session_lock(session_id)
    with lock:
        session = get_session(session_id)
        if not session:
            return None
        if isinstance(updates.get("title"), str):
            session.title = updates["title"]
        if isinstance(updates.get("agentSessionId"), str):
            session.agentSessionId = updates["agentSessionId"]
        session.updatedAt = _now()
        write_session_file(session)
        return session


def delete_session(session_id: str) -> bool:
    path = SESSIONS_ROOT / session_id
    if not path.exists():
        return False
    for item in sorted(path.rglob("*"), reverse=True):
        if item.is_file():
            item.unlink(missing_ok=True)
        elif item.is_dir():
            item.rmdir()
    path.rmdir()
    return True
