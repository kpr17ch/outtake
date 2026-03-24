# OuttakeMotion — details

Composition id: **`OuttakeMotion`** (`src/Root.tsx`). Component: `src/OuttakeMotion.tsx`.

## What it produces

- **Liquid wave transition** — SVG wave overlay
- **Kinetic typography** — words animate in with springs
- **Keyword emphasis** — selected words larger / highlighted
- **Clapperboard** — optional slate animation
- Audio from the source video continues through the render

## Step-by-step (absolute paths)

1. Copy input video to `<project_root>/public/<basename>` (same basename you pass to transcribe).
2. Transcribe (from project root):
   ```bash
   node <project_root>/transcribe-pipeline.mjs --video <basename> --jobId <jobId> --skipRender
   ```
3. Confirm `public/jobs/<jobId>/aligned.json` exists.
4. If you need custom animation windows or defaults, adjust default props for `OuttakeMotion` in `src/Root.tsx` (duration, job paths, etc.).
5. Render:
   ```bash
   cd <project_root> && npx remotion render src/index.ts OuttakeMotion <workspace>/output/<name>_motion.mp4 --concurrency=4
   ```

## Environment

- `ELEVENLABS_API_KEY` in project root `.env` (transcription).
