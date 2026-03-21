# MCP server/ — FFmpeg FastMCP HTTP Service

This service provides a minimal, remote MCP HTTP endpoint for FFmpeg-based media processing.

## Purpose

- expose core video/audio tools over MCP HTTP
- keep media execution separate from domain state logic
- integrate cleanly with `engine-proxy` so every mutation can be tracked and undone

## Files

### `server.py`

Main FastMCP application (`FastMCP("ffmpeg-tools")`) with 10 tools:

- `probe_media(input_file)`
- `cut_clip(input_file, output_file, start, end)`
- `concat_clips(input_files, output_file)`
- `transcode(input_file, output_file, preset)`
- `extract_audio(input_file, output_file)`
- `add_subtitles(input_file, subtitle_file, output_file)`
- `extract_thumbnail(input_file, output_file, time)`
- `check_frame(input_file, time, width=480)`
- `scan_scenes(input_file, threshold=0.3, start=0.0, end=0.0)`
- `cleanup_frames()`

Implementation details:
- Runs as HTTP MCP server on `0.0.0.0:8100/mcp`
- Uses `subprocess.run([...], check=True)` to execute `ffmpeg`/`ffprobe`
- Enforces workspace path safety via `WORKSPACE_ROOT`
- Returns structured output dictionaries used by proxy + operation log (`output_file`, `output_ref_id`)
- For `check_frame`, returns dual MCP content: text metadata plus inline JPEG image content
- Temporary frame images are stored in `WORKSPACE_ROOT/.frames/` and auto-cleaned

### `requirements.txt`

- `fastmcp>=3.1.0`

### `Dockerfile`

- base image: `python:3.11-slim`
- installs system `ffmpeg`
- installs Python deps
- starts server with `python server.py`

## Runtime Contract

This service intentionally does not persist project state.  
It is a stateless execution backend:

- Input: validated file paths + tool args
- Output: processing result metadata

State/history/version ownership remains in:
- `services/engine-proxy/`
- `services/core-runtime/`

## Inspection Tools

### `check_frame`

- Fast-seek single-frame extraction for visual inspection at a specific timestamp.
- Uses `ffmpeg -ss <time> -i <input> -frames:v 1 -vf scale=<width>:-2 -q:v 3`.
- Deletes previous files in `.frames/` before writing a new frame, so only one latest frame stays on disk.
- Returns both:
  - text JSON (`time`, `frame_file`, `width`, `height`, `frame_base64`)
  - MCP image content (`image/jpeg`)

### `scan_scenes`

- Detects scene changes using `select='gt(scene,<threshold>)',metadata=print:file=-`.
- Supports optional `start`/`end` range limits.
- Returns only timestamps and scores (`scene_count`, `scenes`) to keep responses compact.

### `cleanup_frames`

- Explicit helper to delete all temporary files in `WORKSPACE_ROOT/.frames/`.
- Returns `{ "status": "ok", "deleted": <count> }`.

## Environment

- `WORKSPACE_ROOT` (required in practice): root path that all input/output files must stay inside

Example:

```bash
WORKSPACE_ROOT="/Users/Uni/Desktop/Coding" python server.py
```
