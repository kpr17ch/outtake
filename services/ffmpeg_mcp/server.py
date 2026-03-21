from __future__ import annotations

import base64
import json
import os
import re
import subprocess
from pathlib import Path
from uuid import uuid4

from fastmcp import FastMCP
from fastmcp.utilities.types import Image


mcp = FastMCP("ffmpeg-tools")
WORKSPACE_ROOT = Path(os.environ.get("WORKSPACE_ROOT", "/workspace")).resolve()
FRAMES_DIR = WORKSPACE_ROOT / ".frames"

# Standard encoding flags for browser-compatible output
_VIDEO_ENCODE = [
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "fast",
    "-crf", "20",
    "-movflags", "+faststart",
]
_AUDIO_ENCODE = ["-c:a", "aac", "-b:a", "192k"]


def _assert_workspace_path(raw_path: str, *, must_exist: bool) -> Path:
    path = Path(raw_path).expanduser().resolve()
    try:
        path.relative_to(WORKSPACE_ROOT)
    except ValueError as exc:
        raise ValueError(f"Path outside workspace root: {path}") from exc
    if must_exist and not path.exists():
        raise FileNotFoundError(str(path))
    return path


def _run(cmd: list[str]) -> str:
    result = subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return result.stdout


def _mk_output_ref_id(output_file: Path) -> str:
    return f"{output_file.stem}-{uuid4()}"


def _frames_dir() -> Path:
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    return FRAMES_DIR


def _cleanup_frames_dir() -> int:
    root = _frames_dir()
    deleted = 0
    for item in root.iterdir():
        if item.is_file():
            item.unlink()
            deleted += 1
    return deleted


@mcp.tool
def probe_media(input_file: str) -> dict:
    """Get video metadata: codecs, duration, resolution, fps, audio channels."""
    in_path = _assert_workspace_path(input_file, must_exist=True)
    out = _run([
        "ffprobe", "-v", "error", "-print_format", "json",
        "-show_format", "-show_streams", str(in_path),
    ])
    return {"input_file": str(in_path), "probe": json.loads(out)}


@mcp.tool
def cut_clip(input_file: str, output_file: str, start: float, end: float) -> dict:
    """Extract a clip from start to end (seconds). Output is always browser-compatible."""
    in_path = _assert_workspace_path(input_file, must_exist=True)
    out_path = _assert_workspace_path(output_file, must_exist=False)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if end <= start:
        raise ValueError("end must be greater than start")
    _run([
        "ffmpeg", "-y",
        "-ss", str(start), "-to", str(end),
        "-i", str(in_path),
        *_VIDEO_ENCODE, *_AUDIO_ENCODE,
        str(out_path),
    ])
    return {"output_file": str(out_path), "output_ref_id": _mk_output_ref_id(out_path)}


@mcp.tool
def concat_clips(input_files: list[str], output_file: str) -> dict:
    """Concatenate multiple clips in order. Re-encodes for consistent output."""
    out_path = _assert_workspace_path(output_file, must_exist=False)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if not input_files:
        raise ValueError("input_files cannot be empty")
    resolved = [_assert_workspace_path(p, must_exist=True) for p in input_files]
    list_file = out_path.parent / f".concat-{uuid4()}.txt"
    list_file.write_text(
        "".join(f"file '{p.as_posix()}'\n" for p in resolved), encoding="utf-8"
    )
    try:
        _run([
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0", "-i", str(list_file),
            *_VIDEO_ENCODE, *_AUDIO_ENCODE,
            str(out_path),
        ])
    finally:
        if list_file.exists():
            list_file.unlink()
    return {"output_file": str(out_path), "output_ref_id": _mk_output_ref_id(out_path)}


@mcp.tool
def transcode(input_file: str, output_file: str, preset: str) -> dict:
    """Re-encode with quality preset. Always outputs browser-compatible H.264/AAC."""
    in_path = _assert_workspace_path(input_file, must_exist=True)
    out_path = _assert_workspace_path(output_file, must_exist=False)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    presets = {
        "preview": ["-preset", "veryfast", "-crf", "28"],
        "social": ["-preset", "medium", "-crf", "23"],
        "high_quality": ["-preset", "slow", "-crf", "18"],
    }
    if preset not in presets:
        raise ValueError(f"Unknown preset: {preset}")
    _run([
        "ffmpeg", "-y", "-i", str(in_path),
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        *presets[preset],
        *_AUDIO_ENCODE,
        "-movflags", "+faststart",
        str(out_path),
    ])
    return {"output_file": str(out_path), "output_ref_id": _mk_output_ref_id(out_path)}


@mcp.tool
def extract_audio(input_file: str, output_file: str) -> dict:
    """Extract audio track only as AAC."""
    in_path = _assert_workspace_path(input_file, must_exist=True)
    out_path = _assert_workspace_path(output_file, must_exist=False)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    _run(["ffmpeg", "-y", "-i", str(in_path), "-vn", *_AUDIO_ENCODE, str(out_path)])
    return {"output_file": str(out_path), "output_ref_id": _mk_output_ref_id(out_path)}


@mcp.tool
def add_subtitles(input_file: str, subtitle_file: str, output_file: str) -> dict:
    """Burn subtitles into video. Output is browser-compatible."""
    in_path = _assert_workspace_path(input_file, must_exist=True)
    sub_path = _assert_workspace_path(subtitle_file, must_exist=True)
    out_path = _assert_workspace_path(output_file, must_exist=False)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    _run([
        "ffmpeg", "-y", "-i", str(in_path),
        "-vf", f"subtitles={sub_path.as_posix()}",
        *_VIDEO_ENCODE, *_AUDIO_ENCODE,
        str(out_path),
    ])
    return {"output_file": str(out_path), "output_ref_id": _mk_output_ref_id(out_path)}


@mcp.tool
def check_frame(input_file: str, time: float, width: int = 480) -> list[object]:
    """Extract a single frame at timestamp for visual inspection. Returns image."""
    if time < 0:
        raise ValueError("time must be >= 0")
    if width < 64:
        raise ValueError("width must be >= 64")
    in_path = _assert_workspace_path(input_file, must_exist=True)
    _cleanup_frames_dir()
    out_path = _frames_dir() / f"frame_{time:.3f}s.jpg"
    _run([
        "ffmpeg", "-y", "-ss", str(time), "-i", str(in_path),
        "-frames:v", "1", "-vf", f"scale={width}:-2", "-q:v", "3",
        str(out_path),
    ])
    img_bytes = out_path.read_bytes()
    image_content = Image(data=img_bytes, format="jpeg").to_image_content()
    text_payload = {
        "time": time,
        "frame_file": str(out_path),
        "width": width,
        "height": None,
        "frame_base64": base64.b64encode(img_bytes).decode("ascii"),
    }
    return [{"type": "text", "text": json.dumps(text_payload)}, image_content]


@mcp.tool
def scan_scenes(
    input_file: str, threshold: float = 0.3, start: float = 0.0, end: float = 0.0
) -> dict:
    """Detect scene changes. Returns list of timestamps with confidence scores."""
    if threshold < 0 or threshold > 1:
        raise ValueError("threshold must be between 0 and 1")
    if start < 0:
        raise ValueError("start must be >= 0")
    if end != 0.0 and end <= start:
        raise ValueError("end must be > start or 0.0")
    in_path = _assert_workspace_path(input_file, must_exist=True)
    cmd = ["ffmpeg", "-hide_banner"]
    if start > 0:
        cmd += ["-ss", str(start)]
    if end > 0:
        cmd += ["-to", str(end)]
    cmd += [
        "-i", str(in_path),
        "-vf", f"select='gt(scene,{threshold})',metadata=print:file=-",
        "-an", "-f", "null", "-",
    ]
    out = subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    time_re = re.compile(r"pts_time:([0-9]+(?:\.[0-9]+)?)")
    score_re = re.compile(r"lavfi\.scene_score=([0-9]+(?:\.[0-9]+)?)")
    scenes: list[dict[str, float]] = []
    pending_time: float | None = None
    output_text = f"{out.stdout}\n{out.stderr}"
    for line in output_text.splitlines():
        t_match = time_re.search(line)
        if t_match:
            pending_time = float(t_match.group(1))
            continue
        s_match = score_re.search(line)
        if s_match and pending_time is not None:
            scenes.append({"time": pending_time, "score": float(s_match.group(1))})
            pending_time = None
    return {"scene_count": len(scenes), "threshold": threshold, "start": start, "end": end, "scenes": scenes}


@mcp.tool
def cleanup_frames() -> dict:
    """Delete temporary frame files from .frames/ directory."""
    deleted = _cleanup_frames_dir()
    return {"status": "ok", "deleted": deleted}


@mcp.tool
def extract_thumbnail(input_file: str, output_file: str, time: float) -> dict:
    """Extract a single frame as image file at given timestamp."""
    in_path = _assert_workspace_path(input_file, must_exist=True)
    out_path = _assert_workspace_path(output_file, must_exist=False)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    _run([
        "ffmpeg", "-y", "-ss", str(time), "-i", str(in_path),
        "-vframes", "1", str(out_path),
    ])
    return {"output_file": str(out_path), "output_ref_id": _mk_output_ref_id(out_path)}


if __name__ == "__main__":
    mcp.run(transport="http", host="0.0.0.0", port=8100)
