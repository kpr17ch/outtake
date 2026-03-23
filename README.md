# Outtake

AI video editing agent.

Uses a local **agent CLI** process spawned from the Next.js API route with `--print` and `--output-format stream-json`.

## Quick Start

```bash
cd app
cp ../.env.example .env

npm install
npm run dev
# Open http://localhost:3000
```

Start the FFmpeg MCP server on port **8100** (see `services/ffmpeg_mcp/`) so editing tools work.

## Architecture

```
Next.js Web App (app/)
  |
  +-- /api/chat (POST)
  |     |
  |     +-- Spawns `agent`
  |           stream-json over stdout → SSE to the UI
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
|   |   |   +-- api/chat/    <- Agent CLI subprocess integration
|   |   |   +-- page.tsx     <- Main layout
|   |   +-- components/      <- UI components
|   |   +-- lib/             <- Chat hook, types
+-- SYSTEM_PROMPT.md         <- Agent system prompt (loaded via --system-prompt-file)
+-- workspace/               <- Video editing workspace
```

## Tech Stack

- **Agent**: local CLI agent process; FFmpeg via MCP
- **Frontend**: Next.js, React, Tailwind CSS
- **Video**: FFmpeg (via Bash tool)
- **Transcription**: WhisperX (planned)
