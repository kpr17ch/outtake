from __future__ import annotations

import json
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from backend.services.context import resolve_workspace_context
from backend.services.workspace import get_mime_type, resolve_workspace_entry_path

router = APIRouter()


@dataclass
class FileEntry:
    name: str
    path: str
    type: str
    size: int
    modified: str
    mimeType: str | None = None
    children: list["FileEntry"] | None = None


def _list_dir(workspace_root: Path, dir_path: Path) -> list[FileEntry]:
    if not dir_path.exists():
        return []
    results: list[FileEntry] = []
    for entry in sorted(dir_path.iterdir(), key=lambda p: (p.is_file(), p.name.lower())):
        if entry.name.startswith(".") or entry.name == "node_modules":
            continue
        rel_path = str(entry.relative_to(workspace_root))
        stat = entry.stat()
        if entry.is_dir():
            results.append(
                FileEntry(
                    name=entry.name,
                    path=rel_path,
                    type="dir",
                    size=0,
                    modified=stat.st_mtime_ns and __import__("datetime").datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    children=_list_dir(workspace_root, entry),
                )
            )
        else:
            results.append(
                FileEntry(
                    name=entry.name,
                    path=rel_path,
                    type="file",
                    size=stat.st_size,
                    modified=__import__("datetime").datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    mimeType=get_mime_type(entry.name),
                )
            )
    return results


def _stream_file_with_range(file_path: Path, request: Request, content_type: str, cache_control: str) -> StreamingResponse:
    file_size = file_path.stat().st_size
    range_header = request.headers.get("range")

    if range_header:
        try:
            units, rng = range_header.split("=", 1)
            if units != "bytes":
                raise ValueError("Invalid units")
            start_s, end_s = rng.split("-", 1)
            start = int(start_s)
            end = int(end_s) if end_s else min(start + 5 * 1024 * 1024, file_size - 1)
            if start >= file_size or start > end:
                raise ValueError("Unsatisfiable range")
        except Exception:
            raise HTTPException(status_code=416, detail="Invalid range")

        def iter_chunk():
            with file_path.open("rb") as f:
                f.seek(start)
                remaining = end - start + 1
                while remaining > 0:
                    chunk = f.read(min(1024 * 1024, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(end - start + 1),
            "Accept-Ranges": "bytes",
            "Cache-Control": cache_control,
        }
        return StreamingResponse(iter_chunk(), status_code=206, media_type=content_type, headers=headers)

    def iter_all():
        with file_path.open("rb") as f:
            while True:
                chunk = f.read(1024 * 1024)
                if not chunk:
                    break
                yield chunk

    headers = {"Content-Length": str(file_size), "Accept-Ranges": "bytes", "Cache-Control": cache_control}
    return StreamingResponse(iter_all(), media_type=content_type, headers=headers)


def _probe_file(file_path: Path) -> dict:
    cmd = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", str(file_path)]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        return {"needsVideoTranscode": False, "needsAudioTranscode": False, "width": 1920, "height": 1080}
    try:
        data = json.loads(proc.stdout)
    except Exception:
        return {"needsVideoTranscode": False, "needsAudioTranscode": False, "width": 1920, "height": 1080}
    streams = data.get("streams", [])
    needs_v, needs_a, width, height = False, False, 1920, 1080
    for s in streams:
        if s.get("codec_type") == "video":
            width = int(s.get("width") or 1920)
            height = int(s.get("height") or 1080)
            pix = str(s.get("pix_fmt", "")).lower()
            prof = str(s.get("profile", "")).lower()
            if ("10" in pix or "422" in pix or "444" in pix or "4:2:2" in prof or "4:4:4" in prof or "high 10" in prof or width > 1920 or height > 1920):
                needs_v = True
        if s.get("codec_type") == "audio":
            if str(s.get("codec_name", "")).lower() not in {"aac", "mp3", "opus", "vorbis"}:
                needs_a = True
    return {"needsVideoTranscode": needs_v, "needsAudioTranscode": needs_a, "width": width, "height": height}


def _create_proxy(src: Path, target: Path, probe: dict) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    args = ["ffmpeg", "-y", "-i", str(src)]
    if probe["needsVideoTranscode"]:
        scale = "scale='min(1080,iw):-2'" if probe["width"] >= probe["height"] else "scale='-2:min(1080,ih)'"
        args += ["-vf", scale, "-c:v", "libx264", "-profile:v", "main", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "23"]
    else:
        args += ["-c:v", "copy"]
    if probe["needsAudioTranscode"]:
        args += ["-c:a", "aac", "-b:a", "192k"]
    else:
        args += ["-c:a", "copy"]
    args += ["-map", "0:v:0", "-map", "0:a:0?", "-movflags", "+faststart", str(target)]
    proc = subprocess.run(args, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {proc.stderr[-200:]}")


@router.get("/api/workspace/tree")
def workspace_tree(sessionId: str | None = Query(default=None)) -> dict:
    workspace = resolve_workspace_context(sessionId)
    if sessionId and not workspace:
        raise HTTPException(status_code=404, detail="Session not found")
    assert workspace is not None
    tree = _list_dir(workspace.workspace_path, workspace.workspace_path)
    return {"workspace": str(workspace.workspace_path), "tree": [asdict(x) for x in tree]}


@router.get("/api/workspace")
def workspace_raw(sessionId: str | None = Query(default=None)) -> dict:
    workspace = resolve_workspace_context(sessionId)
    if sessionId and not workspace:
        raise HTTPException(status_code=404, detail="Session not found")
    assert workspace is not None
    raw = resolve_workspace_entry_path(workspace.workspace_path, "raw")
    if not raw:
        raise HTTPException(status_code=500, detail="Invalid workspace path")
    raw.mkdir(parents=True, exist_ok=True)
    files: list[dict] = []
    for entry in raw.iterdir():
        if entry.name.startswith(".") or not entry.is_file():
            continue
        st = entry.stat()
        files.append({"name": entry.name, "size": st.st_size, "type": get_mime_type(entry.name), "modified": __import__("datetime").datetime.fromtimestamp(st.st_mtime).isoformat()})
    files.sort(key=lambda x: x["modified"], reverse=True)
    return {"files": files}


@router.get("/api/workspace/files/{file_path:path}")
def workspace_file(file_path: str, request: Request, sessionId: str | None = Query(default=None)):
    workspace = resolve_workspace_context(sessionId)
    if sessionId and not workspace:
        raise HTTPException(status_code=404, detail="Session not found")
    assert workspace is not None
    full = resolve_workspace_entry_path(workspace.workspace_path, file_path)
    if not full:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not full.exists() or not full.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return _stream_file_with_range(full, request, get_mime_type(full.name), "no-cache")


@router.get("/api/workspace/proxy/{file_path:path}")
def workspace_proxy(file_path: str, request: Request, sessionId: str | None = Query(default=None)):
    workspace = resolve_workspace_context(sessionId)
    if sessionId and not workspace:
        raise HTTPException(status_code=404, detail="Session not found")
    assert workspace is not None
    full = resolve_workspace_entry_path(workspace.workspace_path, file_path)
    if not full:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not full.exists() or not full.is_file():
        raise HTTPException(status_code=404, detail="Not found")

    serve = full
    ext = full.suffix.lower().replace(".", "")
    if ext in {"mp4", "mov", "mkv", "avi", "webm"}:
        probe = _probe_file(full)
        if probe["needsVideoTranscode"] or probe["needsAudioTranscode"]:
            proxy_dir = workspace.workspace_path / ".proxy"
            proxy_file = proxy_dir / f"{full.stem}_proxy.mp4"
            if not proxy_file.exists():
                _create_proxy(full, proxy_file, probe)
            serve = proxy_file

    return _stream_file_with_range(serve, request, "video/mp4", "public, max-age=3600")
