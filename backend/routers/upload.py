from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from backend.services.context import resolve_workspace_context
from backend.services.workspace import resolve_workspace_entry_path, sanitize_uploaded_filename

router = APIRouter()

ALLOWED_PREFIXES = ("video/", "audio/", "image/")


@router.post("/api/upload")
async def upload_files(
    files: list[UploadFile] = File(...),
    sessionId: str | None = Form(default=None),
) -> dict:
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    workspace = resolve_workspace_context(sessionId)
    if sessionId and not workspace:
        raise HTTPException(status_code=404, detail="Session not found")
    assert workspace is not None

    input_dir = resolve_workspace_entry_path(workspace.workspace_path, "input")
    if not input_dir:
        raise HTTPException(status_code=500, detail="Invalid workspace path")
    input_dir.mkdir(parents=True, exist_ok=True)

    results: list[dict] = []
    for file in files:
        if not file.filename:
            continue
        content_type = file.content_type or ""
        if not any(content_type.startswith(prefix) for prefix in ALLOWED_PREFIXES):
            results.append({"filename": file.filename, "error": f"Invalid file type: {content_type or 'unknown'}"})
            continue
        safe_name = sanitize_uploaded_filename(file.filename)
        target = Path(input_dir) / safe_name
        content = await file.read()
        target.write_bytes(content)
        results.append(
            {
                "filename": safe_name,
                "originalName": file.filename,
                "path": f"input/{safe_name}",
                "size": len(content),
                "type": content_type,
            }
        )
    return {"files": results}
