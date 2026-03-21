# Outtake

AI-powered video editing agent. Cursor for video editing.

Built on the Claude Agent SDK — the same engine that powers Claude Code, now configured for video editing workflows.

## Quick Start

```bash
cd app
npm install

# Set your API key
cp .env.local.example .env.local
# Edit .env.local and add your ANTHROPIC_API_KEY

npm run dev
# Open http://localhost:3000
```

## How It Works

Outtake uses the **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) to run Claude as an autonomous video editing agent. The agent has access to:

- **Bash** — Execute FFmpeg commands, run scripts
- **Read/Write/Edit** — Manage project files, edit configs
- **Glob/Grep** — Search through video projects
- **MCP Servers** — Custom tools for transcription, media generation, etc.

The agent runs with `permissionMode: "bypassPermissions"` so it can execute FFmpeg commands and file operations without interactive prompts.

## Architecture

```
Next.js Web App (app/)
  |
  +-- /api/chat (Server Route)
  |     |
  |     +-- Claude Agent SDK
  |           |
  |           +-- Claude Opus 4.6
  |           +-- Built-in tools (Bash, Read, Write, Edit, Glob, Grep)
  |           +-- MCP: ffmpeg-tools (coming)
  |           +-- MCP: whisperx (coming)
  |           +-- MCP: media-gen (coming)
  |
  +-- Chat UI (React)
  |     +-- Streaming responses
  |     +-- Thinking blocks
  |     +-- Tool call visualization
  |
  +-- Video Preview Panel
        +-- HTML5 video player
        +-- Timeline scrubbing
```

## Project Structure

```
outtake/
+-- app/                     <- Next.js web application
|   +-- src/
|   |   +-- app/
|   |   |   +-- api/chat/    <- Claude Agent SDK integration
|   |   |   +-- page.tsx     <- Main layout
|   |   +-- components/      <- UI components
|   |   +-- lib/             <- Chat hook, types
|   +-- .env.local           <- API key (not committed)
+-- CLAUDE.md                <- Agent system prompt
+-- mcp-servers/             <- Custom MCP servers (coming)
|   +-- ffmpeg-server/       <- FFmpeg operations
|   +-- whisperx-server/     <- Transcription + speaker ID
|   +-- media-gen-server/    <- Voice, music, SFX generation
+-- core/                    <- Pipeline orchestration (coming)
+-- generators/              <- Media generation modules (coming)
+-- engine/                  <- Edit state, undo/redo (coming)
```

## Team

- **Person 1** — Core platform, AI brain, Claude Agent SDK integration
- **Person 2** — Media generation (voice, music, SFX, B-Roll)
- **Person 3** — Edit engine, undo/redo, tool registry, MCP orchestration

## Tech Stack

- **Runtime**: Claude Agent SDK + Claude Opus 4.6
- **Frontend**: Next.js 16, React 19, Tailwind CSS 4
- **Video**: FFmpeg (via Bash), Remotion (planned)
- **Transcription**: WhisperX (planned MCP server)
- **Audio**: ElevenLabs / Kokoro (planned)
