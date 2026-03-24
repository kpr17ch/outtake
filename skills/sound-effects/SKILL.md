---
name: sound-effects
description: ElevenLabs sound effects from text; mix into timeline via FFmpeg MCP (mix_sfx).
tags: elevenlabs, sfx, audio, ambience
---

# Sound effects

Requires `ELEVENLABS_API_KEY` in environment (see app `.env`).

## Pattern

1. Generate SFX to `<workspace>/output/sfx_<name>.mp3` (use project scripts or API as documented in references).
2. Mix into the active video with MCP tool **`ffmpeg/mix_sfx`** — pass absolute paths under the workspace.

## Reference

Installation and API snippets: `read_skill_file` with `sound-effects/references/installation.md`.
