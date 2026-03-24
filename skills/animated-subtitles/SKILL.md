---
name: animated-subtitles
description: Word-by-word animated captions — ElevenLabs Scribe v2 + Remotion SubtitleJobPreview.
tags: remotion, subtitles, captions, SubtitleJobPreview, transcription
---

# Animated subtitles (SubtitleJobPreview)

Requires `ELEVENLABS_API_KEY` in project `.env`. Use **`run_skill_command`** with `cwd='project'` for `node` / `npx`.

## Pattern

1. `cp <workspace>/input/<video> <project_root>/public/`
2. `node transcribe-pipeline.mjs --video <video> --jobId <id> --fps <fps> --skipRender` (cwd = project root).
3. `npx remotion render src/index.ts SubtitleJobPreview <workspace>/output/<name>_subtitles.mp4 --props '...'` (cwd = project root).

Composition id: **`SubtitleJobPreview`**. Use absolute paths from the workspace block for `--props`.

## Reference

Props shape, patch JSON, and commands: `read_skill_file` with `animated-subtitles/references/workflow.md`.
