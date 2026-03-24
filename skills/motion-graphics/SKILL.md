---
name: motion-graphics
description: Remotion OuttakeMotion — kinetic typography, wave transitions, keyword emphasis; transcribe then render.
tags: remotion, outtake-motion, motion graphics, kinetic typography, animation
---

# Motion graphics (OuttakeMotion)

Requires `ELEVENLABS_API_KEY` in project `.env`. Use **`run_skill_command`** with `cwd='project'` for `node` / `npx` under the project root.

## Pattern

1. Copy video to `<project_root>/public/`.
2. `node transcribe-pipeline.mjs --video <basename> --jobId <id> --skipRender` (cwd = project root).
3. `npx remotion render src/index.ts OuttakeMotion <workspace>/output/<name>_motion.mp4` (cwd = project root).

Composition id: **`OuttakeMotion`**. Paths: use absolute values from the system prompt workspace block (`Project root`, `Workspace`).

## Reference

Full step list and props: `read_skill_file` with `motion-graphics/references/outtake-motion.md`.
