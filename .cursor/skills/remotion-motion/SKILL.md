---
name: remotion-motion
description: Generate frame-based motion graphics animations for video clips using ElevenLabs transcription and Remotion. Supports liquid wave transitions, word-by-word kinetic typography, clapperboard icons, and keyword emphasis.
---

# Remotion Motion Graphics — Agent Skill

## Quick Start

```bash
# 1. Transcribe video (ElevenLabs Scribe v2)
node transcribe-pipeline.mjs --video VIDEO.mp4 --jobId JOB_ID --skipRender

# 2. Render motion graphics
npx remotion render src/index.ts OuttakeMotion out/OuttakeMotion.mp4
```

## What This Skill Does

Generates animated motion graphics overlays for video clips:

- **Liquid Wave Transition**: Organic multi-drip SVG wave that fills the screen from top, replacing the video with a colored background
- **Kinetic Typography**: Words from the transcript fly in one-by-one with spring animations (scale, translateY, opacity)
- **Keyword Emphasis**: Special words (e.g. "not") render larger, in red, with an animated underline
- **Clapperboard Icon**: Animated film slate that appears during relevant words, with a spring-driven clap animation
- **Audio Continuity**: Video audio plays throughout — only the visual changes during the animation range

## Prerequisites

- `ELEVENLABS_API_KEY` must be set in `.env` at the project root
- Dependencies: `@elevenlabs/elevenlabs-js`, `dotenv`, `remotion` (already in `package.json`)

## Pipeline

```
Video → transcribe-pipeline.mjs → aligned.json → OuttakeMotion (Remotion) → MP4
```

1. **Transcribe** — `transcribe-pipeline.mjs` extracts audio, calls ElevenLabs Scribe v2, outputs `aligned.json` with word-level timestamps
2. **Configure** — Set `animationStart` and `animationEnd` frame numbers for the motion graphics range
3. **Render** — Remotion renders the `OuttakeMotion` composition with liquid wave + animated text

## OuttakeMotion Composition

Defined in `src/OuttakeMotion.tsx`. Props:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `videoSrc` | string | `"OuttakesQuelle1.mp4"` | Video filename in `public/` |
| `captionsSrc` | string | `"jobs/.../aligned.json"` | Path to aligned word timings JSON |
| `animationStart` | number | `78` | Frame where animation begins |
| `animationEnd` | number | `170` | Frame where animation ends |

Registered in `src/Root.tsx` with `id: "OuttakeMotion"`.

## What the Agent Must Do

When a user asks for motion graphics on a video:

1. Ensure the video exists in `public/` (or use an absolute path).
2. Run the transcription pipeline:
   ```bash
   node transcribe-pipeline.mjs --video <videoName> --jobId <jobId> --skipRender
   ```
3. Read `public/jobs/<jobId>/aligned.json` to see word timings.
4. Determine which frame range the animation should cover.
5. Update `src/Root.tsx` defaultProps with the correct `animationStart`, `animationEnd`, `videoSrc`, and `captionsSrc`.
6. Render:
   ```bash
   npx remotion render src/index.ts OuttakeMotion out/OuttakeMotion.mp4 --concurrency=4
   ```
7. Show `out/OuttakeMotion.mp4` to the user.

## Animation Components

### LiquidWave
SVG-based organic wave with 9 drip points, each with individual delay. Uses Catmull-Rom splines for smooth curves and smoothstep easing. Flows from top to bottom on enter, reverses on exit.

### MotionWord
Spring-animated word with scale, translateY, and opacity transitions. Special handling for "not" (large, red, animated underline).

### ClapperboardOverlay
Animated film slate SVG that appears during specific word ranges. The clapper arm pivots shut with a snappy spring and subtle scale bounce on impact.

## CLI Arguments (transcribe-pipeline.mjs)

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--video` | full mode | — | Video filename in `public/` or absolute path |
| `--jobId` | patch mode | auto | Stable external ID for the job |
| `--mode` | no | `full` | `full` or `patch` |
| `--lang` | no | auto-detect | Force language (ISO-639 code) |
| `--fps` | no | `30` | Target FPS for frame conversion |
| `--patch` | patch mode | — | Path to patch JSON file |
| `--skipRender` | no | false | Skip preview MP4 rendering |

## Checklist

- [ ] `ELEVENLABS_API_KEY` set in `.env`
- [ ] `transcribe-pipeline.mjs` executed with `--jobId`
- [ ] `public/jobs/{jobId}/aligned.json` exists with word timings
- [ ] `animationStart` and `animationEnd` frames configured in Root.tsx
- [ ] `out/OuttakeMotion.mp4` rendered and shown to user
- [ ] If timing feedback received, patch mode was run
