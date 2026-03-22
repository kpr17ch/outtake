# Outtake

AI video editing agent. Cursor for video editing.

Uses the **Cursor Agent CLI** by default (`OUTTAKE_AGENT_BACKEND=cursor`) — spawned from a Next.js API route with `--print` and `--output-format stream-json`. Set **`CURSOR_API_KEY`** in [`app/.env`](app/.env) (see [`app/.env.example`](app/.env.example)).

**Optional:** set `OUTTAKE_AGENT_BACKEND=claude` to use [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) instead (subscription auth).

## Quick Start

```bash
# Install Cursor Agent CLI (adds `agent` to your PATH)
curl https://cursor.com/install -fsSL | bash

cd app
cp .env.example .env
# Edit .env: set CURSOR_API_KEY from Cursor (Dashboard → API / CLI key)

npm install
npm run dev
# Open http://localhost:3000
```

Start the FFmpeg MCP server on port **8100** (see `services/ffmpeg_mcp/`) so editing tools work. MCP for the Cursor CLI is configured in [`.cursor/mcp.json`](.cursor/mcp.json) (same URL as [`mcp-config.json`](mcp-config.json) for Claude).

## Architecture

```
Next.js Web App (app/)
  |
  +-- /api/chat (POST)
  |     |
  |     +-- Spawns Cursor `agent` (or `claude` if OUTTAKE_AGENT_BACKEND=claude)
  |           stream-json over stdout → SSE to the UI
  |           +-- Cursor: CURSOR_API_KEY, .cursor/mcp.json, --force --approve-mcps
  |           +-- Claude: mcp-config.json, --system-prompt-file SYSTEM_PROMPT.md
  |
  +-- Chat UI (React)
  |     +-- SSE streaming from CLI JSON output
  |     +-- Tool call visualization
  |
  +-- Video Preview Panel (planned)
```

## Project Structure

```
outtake/
+-- app/                     <- Next.js web application
|   +-- src/
|   |   +-- app/
|   |   |   +-- api/chat/    <- Cursor or Claude CLI subprocess integration
|   |   |   +-- page.tsx     <- Main layout
|   |   +-- components/      <- UI components
|   |   +-- lib/             <- Chat hook, types
+-- SYSTEM_PROMPT.md         <- Agent system prompt (loaded via --system-prompt-file)
+-- workspace/               <- Video editing workspace (cwd for Claude)
```

## Tech Stack

- **Agent**: Cursor Agent CLI (default) or Claude Code CLI; FFmpeg via MCP
- **Frontend**: Next.js, React, Tailwind CSS
- **Video**: FFmpeg (via Bash tool)
- **Transcription**: WhisperX (planned)
