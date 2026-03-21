# Outtake

AI-powered video editing agent. Cursor for video editing.

Uses Claude Code as runtime + MCP servers for video tools.

## Setup

```bash
# Install Claude Code
npm install -g @anthropic-ai/claude-code

# Run in project directory
cd outtake
claude
```

## Architecture

```
Claude Code (Agent Runtime + Claude Opus)
  ├── MCP: ffmpeg-server      -> Video cutting, transitions, audio
  ├── MCP: whisperx-server    -> Transcription, speaker diarization
  └── MCP: media-gen-server   -> Voice, music, SFX generation
```

## Project Structure

```
outtake/
├── CLAUDE.md              <- Agent instructions
├── .claude/settings.json  <- MCP server config
├── mcp-servers/
│   ├── ffmpeg-server/     -> FFmpeg operations as MCP tools
│   ├── whisperx-server/   -> Transcription + speaker ID
│   └── media-gen-server/  -> Voice, music, SFX generation
├── core/                  -> Pipeline, orchestration
├── generators/            -> Media generation modules
└── engine/                -> Edit state, undo/redo, tool registry
```

## Also works with OpenCode

```bash
# Install OpenCode
curl -fsSL https://opencode.ai/install | bash

cd outtake
opencode
```
