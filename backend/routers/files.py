from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request

from backend.services.context import resolve_workspace_context
from backend.services.workspace import get_mime_type, resolve_workspace_entry_path
from backend.routers.workspace import _stream_file_with_range

router = APIRouter()


@router.get("/api/files")
def get_file(
    request: Request,
    name: str = Query(...),
    sessionId: str | None = Query(default=None),
):
    workspace = resolve_workspace_context(sessionId)
    if sessionId and not workspace:
        raise HTTPException(status_code=404, detail="Session not found")
    assert workspace is not None
    raw_dir = resolve_workspace_entry_path(workspace.workspace_path, "raw")
    if not raw_dir:
        raise HTTPException(status_code=500, detail="Invalid workspace path")
    safe_name = name.replace("/", "").replace("\\", "")
    full = Path(raw_dir) / safe_name
    if not full.exists() or not full.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return _stream_file_with_range(full, request, get_mime_type(safe_name), "public, max-age=3600")
