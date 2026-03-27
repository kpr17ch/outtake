from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException

from backend.services.context import resolve_workspace_context
from backend.services.workspace import resolve_workspace_entry_path

router = APIRouter()


@router.post("/api/workspace/render")
def render_sequence(payload: dict) -> dict:
    session_id = payload.get("sessionId")
    sequence = payload.get("sequence")
    if not isinstance(sequence, dict):
        raise HTTPException(status_code=400, detail="Missing sequence")
    workspace = resolve_workspace_context(session_id if isinstance(session_id, str) else None)
    if isinstance(session_id, str) and not workspace:
        raise HTTPException(status_code=404, detail="Session not found")
    if not workspace:
        raise HTTPException(status_code=500, detail="Workspace unavailable")

    tracks = sequence.get("tracks")
    if not isinstance(tracks, list):
        raise HTTPException(status_code=400, detail="Invalid tracks")

    video_clip = None
    audio_clips: list[dict] = []
    for tr in tracks:
        if not isinstance(tr, dict):
            continue
        ttype = tr.get("type")
        clips = tr.get("clips") if isinstance(tr.get("clips"), list) else []
        if ttype == "video" and not video_clip and clips:
            video_clip = clips[0]
        if ttype == "audio":
            audio_clips.extend([c for c in clips if isinstance(c, dict)])

    if not isinstance(video_clip, dict):
        raise HTTPException(status_code=400, detail="No video clip found")

    asset_path = str(video_clip.get("assetPath") or "")
    input_video = resolve_workspace_entry_path(workspace.workspace_path, asset_path)
    if not input_video or not input_video.exists():
        raise HTTPException(status_code=400, detail="Video clip path invalid")

    output = workspace.workspace_path / "output" / f"render_{int(time.time())}.mp4"

    cmd = ["ffmpeg", "-y", "-i", str(input_video)]
    filter_parts: list[str] = []
    mix_inputs: list[str] = []
    input_idx = 1
    for clip in audio_clips:
        ap = resolve_workspace_entry_path(workspace.workspace_path, str(clip.get("assetPath") or ""))
        if not ap or not ap.exists():
            continue
        cmd.extend(["-i", str(ap)])
        delay_ms = int(float(clip.get("timelineIn") or 0) * 1000)
        label = f"a{input_idx}"
        filter_parts.append(f"[{input_idx}:a]adelay={delay_ms}|{delay_ms}[{label}]")
        mix_inputs.append(f"[{label}]")
        input_idx += 1

    if mix_inputs:
        filter_parts.append(f"{''.join(mix_inputs)}amix=inputs={len(mix_inputs)}:duration=first[aout]")
        cmd.extend(["-filter_complex", ";".join(filter_parts), "-map", "0:v:0", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", str(output)])
    else:
        cmd.extend(["-map", "0:v:0", "-map", "0:a:0?", "-c:v", "copy", "-c:a", "aac", str(output)])

    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise HTTPException(status_code=500, detail=proc.stderr[-1000:])

    seq_file = workspace.workspace_path / "sequence.json"
    seq_file.write_text(json.dumps(sequence), encoding="utf-8")
    return {"status": "ok", "output": str(output), "sequence": str(seq_file)}

