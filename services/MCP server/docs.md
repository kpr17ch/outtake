# MCP server/ — FFmpeg FastMCP HTTP Service

This service provides a minimal, remote MCP HTTP endpoint for FFmpeg-based media processing.

## Purpose

- expose core video/audio tools over MCP HTTP
- keep media execution separate from domain state logic
- integrate cleanly with `engine-proxy` so every mutation can be tracked and undone

## Files

### `server.py`

Main FastMCP application (`FastMCP("ffmpeg-tools")`) with 7 tools:

- `probe_media(input_file)`
- `cut_clip(input_file, output_file, start, end)`
- `concat_clips(input_files, output_file)`
- `transcode(input_file, output_file, preset)`
- `extract_audio(input_file, output_file)`
- `add_subtitles(input_file, subtitle_file, output_file)`
- `extract_thumbnail(input_file, output_file, time)`

Implementation details:
- Runs as HTTP MCP server on `0.0.0.0:8100/mcp`
- Uses `subprocess.run([...], check=True)` to execute `ffmpeg`/`ffprobe`
- Enforces workspace path safety via `WORKSPACE_ROOT`
- Returns structured output dictionaries used by proxy + operation log (`output_file`, `output_ref_id`)

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

## Environment

- `WORKSPACE_ROOT` (required in practice): root path that all input/output files must stay inside

Example:

```bash
WORKSPACE_ROOT="/Users/Uni/Desktop/Coding" python server.py
```
