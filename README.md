# Outtake

AI video editing agent. Cursor for video editing.

Uses **Claude Code CLI** as a subprocess — spawned from a Next.js API route with `--output-format stream-json`. No API key needed; runs on a Claude Code subscription.

## Quick Start

```bash
cd app
npm install
npm run dev
# Open http://localhost:3000
```

Requires [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated.

## Architecture

```
Next.js Web App (app/)
  |
  +-- /api/chat (POST)
  |     |
  |     +-- Spawns `claude` CLI subprocess
  |           --output-format stream-json
  |           --system-prompt-file SYSTEM_PROMPT.md
  |           --dangerously-skip-permissions
  |           |
  |           +-- Claude Opus 4.6
  |           +-- Tools: Bash, Read, Write, Edit, Glob, Grep
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
|   |   |   +-- api/chat/    <- Claude CLI subprocess integration
|   |   |   +-- page.tsx     <- Main layout
|   |   +-- components/      <- UI components
|   |   +-- lib/             <- Chat hook, types
+-- SYSTEM_PROMPT.md         <- Agent system prompt (loaded via --system-prompt-file)
+-- workspace/               <- Video editing workspace (cwd for Claude)
```

## Tech Stack

- **Agent**: Claude Code CLI + Claude Opus 4.6
- **Frontend**: Next.js, React, Tailwind CSS
- **Video**: FFmpeg (via Bash tool)
- **Transcription**: WhisperX (planned)
