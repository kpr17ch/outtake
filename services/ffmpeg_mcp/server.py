from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from uuid import uuid4

from fastmcp import FastMCP


mcp = FastMCP("ffmpeg-tools")
WORKSPACE_ROOT = Path(os.environ.get("WORKSPACE_ROOT", "/workspace")).resolve()


def _assert_workspace_path(raw_path: str, *, must_exist: bool) -> Path:
    path = Path(raw_path).expanduser().resolve()
    try:
        path.relative_to(WORKSPACE_ROOT)
    except ValueError as exc:
        raise ValueError(f"Path outside workspace root: {path}") from exc
    if must_exist and not path.exists():
        raise FileNotFoundError(str(path))
    return path


def _run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


def _mk_output_ref_id(output_file: Path) -> str:
    return f"{output_file.stem}-{uuid4()}"


@mcp.tool
def probe_media(input_file: str) -> dict:
    in_path = _assert_workspace_path(input_file, must_exist=True)
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(in_path),
    ]
    out = subprocess.run(
        cmd,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return {"input_file": str(in_path), "probe": json.loads(out.stdout)}


@mcp.tool
def cut_clip(input_file: str, output_file: str, start: float, end: float) -> dict:
    in_path = _assert_workspace_path(input_file, must_exist=True)
    out_path = _assert_workspace_path(output_file, must_exist=False)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if end <= start:
        raise ValueError("end must be greater than start")
    _run(
        [
            "ffmpeg",
            "-y",
            "-ss",
            str(start),
            "-to",
            str(end),
            "-i",
            str(in_path),
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            str(out_path),
        ]
    )
    return {"output_file": str(out_path), "output_ref_id": _mk_output_ref_id(out_path)}


@mcp.tool
def concat_clips(input_files: list[str], output_file: str) -> dict:
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
        _run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(list_file),
                "-c",
                "copy",
                str(out_path),
            ]
        )
    finally:
        if list_file.exists():
            list_file.unlink()
    return {"output_file": str(out_path), "output_ref_id": _mk_output_ref_id(out_path)}


@mcp.tool
def transcode(input_file: str, output_file: str, preset: str) -> dict:
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
    _run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(in_path),
            "-c:v",
            "libx264",
            *presets[preset],
            "-c:a",
            "aac",
            str(out_path),
        ]
    )
    return {"output_file": str(out_path), "output_ref_id": _mk_output_ref_id(out_path)}


@mcp.tool
def extract_audio(input_file: str, output_file: str) -> dict:
    in_path = _assert_workspace_path(input_file, must_exist=True)
    out_path = _assert_workspace_path(output_file, must_exist=False)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    _run(["ffmpeg", "-y", "-i", str(in_path), "-vn", "-c:a", "aac", str(out_path)])
    return {"output_file": str(out_path), "output_ref_id": _mk_output_ref_id(out_path)}


@mcp.tool
def add_subtitles(input_file: str, subtitle_file: str, output_file: str) -> dict:
    in_path = _assert_workspace_path(input_file, must_exist=True)
    sub_path = _assert_workspace_path(subtitle_file, must_exist=True)
    out_path = _assert_workspace_path(output_file, must_exist=False)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    _run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(in_path),
            "-vf",
            f"subtitles={sub_path.as_posix()}",
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            str(out_path),
        ]
    )
    return {"output_file": str(out_path), "output_ref_id": _mk_output_ref_id(out_path)}


@mcp.tool
def extract_thumbnail(input_file: str, output_file: str, time: float) -> dict:
    in_path = _assert_workspace_path(input_file, must_exist=True)
    out_path = _assert_workspace_path(output_file, must_exist=False)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    _run(
        [
            "ffmpeg",
            "-y",
            "-ss",
            str(time),
            "-i",
            str(in_path),
            "-vframes",
            "1",
            str(out_path),
        ]
    )
    return {"output_file": str(out_path), "output_ref_id": _mk_output_ref_id(out_path)}


if __name__ == "__main__":
    mcp.run(transport="http", host="0.0.0.0", port=8100)
