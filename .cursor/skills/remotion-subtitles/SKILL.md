---
name: remotion-subtitles
description: Generate frame-accurate subtitles for arbitrary videos using ElevenLabs Scribe v2 and Remotion. Supports auto language detection, preview rendering, and iterative feedback via patch mode.
---

# Remotion Subtitles — Agent Skill

## Quick Start

```bash
# Full generation (any video)
node subtitle-pipeline.mjs --video VIDEO.mp4 --jobId JOB_ID

# Feedback patch loop
node subtitle-pipeline.mjs --mode patch --jobId JOB_ID --patch PATCH.json
```

Artifacts per job:

| File | Path |
|------|------|
| Aligned captions | `public/jobs/{jobId}/aligned.json` |
| Diagnostics | `public/jobs/{jobId}/result.json` |
| Preview MP4 | `out/jobs/{jobId}/preview.mp4` |

## Prerequisites

- `ELEVENLABS_API_KEY` must be set in `.env` at the project root
- Dependencies: `@elevenlabs/elevenlabs-js`, `dotenv` (already in `package.json`)

## How Timing Works

ElevenLabs Scribe v2 provides **word-level timestamps directly** — no sub-word token merging needed:

```json
{ "text": "Creating", "start": 0.219, "end": 0.539, "type": "word" }
```

The `start` field is the actual word onset in seconds. The pipeline converts to milliseconds and uses it directly:

```
onsetMs = Math.round(word.start * 1000)
```

Each word is clamped so it never overlaps the previous:

```
onsetMs = max(onsetMs, prevOnsetMs + 50ms)
```

This produces captions that:

- Appear exactly when the speaker begins each word
- Respect natural pauses (silence gaps are preserved as-is)
- Never overlap or become invisible (minimum 50ms gap)
- Work reliably across languages

## Pipeline Steps (Full Mode)

1. **Extract audio** — ffmpeg extracts audio as MP3 (small file for fast API upload)
2. **Transcribe** — ElevenLabs Scribe v2 with word-level timestamps (auto language detection)
3. **Build aligned captions** — filter words, convert seconds to ms, enforce monotonic gap
4. **Render** — Remotion renders a preview MP4 with captions overlay

## What the Agent Must Do

When a user asks for subtitles:

1. Ensure the video exists in `public/` (or pass an absolute path).
2. Run the full pipeline:
   ```bash
   node subtitle-pipeline.mjs --video <videoName> --jobId <jobId>
   ```
3. Read `public/jobs/<jobId>/result.json` and check `diagnostics.wordCount`.
4. Show `out/jobs/<jobId>/preview.mp4` to the user.
5. If the user reports wrong timing, create a patch JSON and run:
   ```bash
   node subtitle-pipeline.mjs --mode patch --jobId <jobId> --patch <patchFile>
   ```
6. Repeat step 5 until approved.

## CLI Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--video` | full mode | — | Video filename in `public/` or absolute path |
| `--jobId` | patch mode | auto | Stable external ID for the job |
| `--mode` | no | `full` | `full` or `patch` |
| `--lang` | no | auto-detect | Force language (ISO-639 code, e.g. `eng`, `deu`) |
| `--fps` | no | `30` | Target FPS for frame conversion |
| `--patch` | patch mode | — | Path to patch JSON file |
| `--skipRender` | no | false | Skip preview MP4 rendering |

## Patch JSON Format

```json
{
  "wordShifts": [
    {"index": 5, "shiftMs": -60},
    {"match": "Turning", "occurrence": 1, "shiftMs": -40}
  ],
  "rangeShifts": [
    {"fromMs": 5000, "toMs": 7000, "shiftMs": 30}
  ],
  "locks": [0, 1, 2]
}
```

- `wordShifts` — shift individual words by index or text match
- `rangeShifts` — bulk shift all words within a time range
- `locks` — protect specific word indices from range shifts

## Remotion Component Template

The `OuttakesCaption` component in `src/OuttakesCaption.tsx` renders the captions overlay. It accepts dynamic props:

```tsx
interface Props {
  jobId: string;
  videoSrc: string;       // e.g. "jobs/demo/source.mp4"
  captionsSrc: string;    // e.g. "jobs/demo/aligned.json"
  durationInFrames: number;
}
```

Registration in `src/Root.tsx`:

```tsx
<Composition
  id="SubtitleJobPreview"
  component={OuttakesCaption}
  durationInFrames={1800}
  fps={30}
  width={1920}
  height={1080}
  defaultProps={{
    jobId: "demo-subtitles",
    videoSrc: "OuttakesQuelle1.mp4",
    captionsSrc: "jobs/demo-subtitles/aligned.json",
    durationInFrames: 1800,
  }}
  calculateMetadata={({props}) => ({
    durationInFrames: props.durationInFrames ?? 1800,
    fps: props.fps ?? 30,
    width: props.width ?? 1920,
    height: props.height ?? 1080,
  })}
/>
```

## Giving This Skill to Your Agent

### Cursor Agent

Already active — lives at `.cursor/skills/remotion-subtitles/SKILL.md`.

### Claude Code Agent (system prompt)

Include the content of this SKILL.md in the system prompt when invoking Claude Code for subtitle tasks. Example:

```
You have access to a Remotion subtitle pipeline. [paste SKILL.md content here]

The user wants subtitles for their video. Run the pipeline and show the preview.
```

### Next.js API Route (programmatic)

Call `subtitle-pipeline.mjs` as a child process:

```typescript
import { execSync } from "child_process";
import fs from "fs";

const jobId = req.body.jobId;
const videoPath = `/absolute/path/to/${req.body.video}`;

execSync(
  `node subtitle-pipeline.mjs --video "${videoPath}" --jobId ${jobId}`,
  { cwd: "/path/to/remotion-project" }
);

const result = JSON.parse(
  fs.readFileSync(`public/jobs/${jobId}/result.json`, "utf8")
);
```

Ensure `ELEVENLABS_API_KEY` is set in the environment where the child process runs.

## Checklist

- [ ] `ELEVENLABS_API_KEY` set in `.env`
- [ ] `subtitle-pipeline.mjs` executed with `--jobId`
- [ ] `public/jobs/{jobId}/result.json` exists with `diagnostics.wordCount > 0`
- [ ] `out/jobs/{jobId}/preview.mp4` exists and shown in app
- [ ] If timing feedback received, patch mode was run
- [ ] Approved `aligned.json` persisted as final source of truth
