from __future__ import annotations

import json
import subprocess
from pathlib import Path


def _run(cmd: list[str]) -> tuple[int, str, str]:
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    return proc.returncode, proc.stdout, proc.stderr


def probe_media(input_file: Path) -> dict:
    code, out, _ = _run(
        [
            "ffprobe",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            str(input_file),
        ]
    )
    if code != 0:
        return {}
    try:
        return json.loads(out)
    except Exception:
        return {}


def ingest_normalize(input_file: Path, workspace_path: Path) -> dict:
    data = probe_media(input_file)
    streams = data.get("streams", []) if isinstance(data, dict) else []
    has_video = any(s.get("codec_type") == "video" for s in streams)
    has_audio = any(s.get("codec_type") == "audio" for s in streams)

    normalized_dir = workspace_path / ".normalized"
    meta_dir = workspace_path / ".meta"
    normalized_dir.mkdir(parents=True, exist_ok=True)
    meta_dir.mkdir(parents=True, exist_ok=True)

    stem = input_file.stem
    norm_path = normalized_dir / (f"{stem}_norm.mp4" if has_video else f"{stem}_norm.m4a")
    cmd: list[str]
    if has_video:
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(input_file),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-ar",
            "44100",
            "-ac",
            "2",
            str(norm_path),
        ]
    else:
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(input_file),
            "-c:a",
            "aac",
            "-ar",
            "44100",
            "-ac",
            "2",
            str(norm_path),
        ]
    code, _, err = _run(cmd)
    if code != 0:
        return {"ok": False, "error": err[-500:]}

    duration = None
    fps = None
    width = None
    height = None
    codec = None
    sample_rate = None
    for s in streams:
        if s.get("codec_type") == "video":
            width = s.get("width")
            height = s.get("height")
            codec = s.get("codec_name")
            try:
                r_frame_rate = str(s.get("r_frame_rate") or "0/1")
                n, d = r_frame_rate.split("/")
                fps = float(n) / max(float(d), 1.0)
            except Exception:
                fps = None
        if s.get("codec_type") == "audio":
            sample_rate = s.get("sample_rate")
            codec = codec or s.get("codec_name")
    try:
        duration = float((data.get("format") or {}).get("duration"))
    except Exception:
        duration = None

    meta = {
        "source": str(input_file),
        "normalized": str(norm_path),
        "duration": duration,
        "fps": fps,
        "width": width,
        "height": height,
        "hasAudio": has_audio,
        "codec": codec,
        "sampleRate": sample_rate,
    }
    (meta_dir / f"{stem}.json").write_text(json.dumps(meta), encoding="utf-8")
    return {"ok": True, "meta": meta}

