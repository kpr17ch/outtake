from __future__ import annotations

import mimetypes
import os
import re
from pathlib import Path


WORKSPACE_SUBDIRS = ("input", "output")
PROJECT_ROOT = Path(__file__).resolve().parents[2]
SESSIONS_ROOT = PROJECT_ROOT / "sessions"
DEFAULT_WORKSPACE_ROOT = PROJECT_ROOT / "workspace"


def get_default_workspace_path() -> Path:
    env = os.environ.get("OUTTAKE_CWD")
    return Path(env).resolve() if env else DEFAULT_WORKSPACE_ROOT.resolve()


def get_session_workspace_path(session_id: str) -> Path:
    return (SESSIONS_ROOT / session_id / "workspace").resolve()


def ensure_workspace_structure(workspace_path: Path) -> None:
    workspace_path.mkdir(parents=True, exist_ok=True)
    for subdir in WORKSPACE_SUBDIRS:
        (workspace_path / subdir).mkdir(parents=True, exist_ok=True)


def resolve_workspace_entry_path(workspace_path: Path, relative_path: str = "") -> Path | None:
    root = workspace_path.resolve()
    full = (root / relative_path).resolve()
    if full == root or str(full).startswith(f"{root}{os.sep}"):
        return full
    return None


def sanitize_uploaded_filename(filename: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]", "_", filename)


def get_mime_type(filename: str) -> str:
    mime, _ = mimetypes.guess_type(filename)
    return mime or "application/octet-stream"
