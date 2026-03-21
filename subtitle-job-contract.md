# Subtitle Job Contract

## Purpose

Defines the stable input/output contract between your web app and `subtitle-pipeline.mjs`.

## Prerequisites

- `ELEVENLABS_API_KEY` must be set in `.env` (or in the process environment)
- Node.js dependencies: `@elevenlabs/elevenlabs-js`, `dotenv`

## Input Contract

### Full generation mode

```bash
node subtitle-pipeline.mjs --video VIDEO.mp4 [--jobId JOB_ID] [--fps 30] [--lang eng]
```

- `--video` (required): filename in `public/` or absolute path
- `--jobId` (optional): external id from your backend; auto-generated if omitted
- `--fps` (optional): target FPS for frame conversion (default: 30)
- `--lang` (optional): ISO-639 language code (e.g. `eng`, `deu`); if omitted ElevenLabs auto-detects

### Feedback patch mode

```bash
node subtitle-pipeline.mjs --mode patch --jobId JOB_ID --patch PATCH.json
```

- Loads existing `public/jobs/{jobId}/aligned.json`
- Applies patch operations
- Re-renders preview MP4

## Patch Format

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

- `wordShifts`: targeted corrections by index or text match
- `rangeShifts`: bulk shift all words within a ms range
- `locks`: protected indices that shifts cannot modify

## Output Contract

For each job id:

| File | Path |
|------|------|
| Source video copy | `public/jobs/{jobId}/source.mp4` |
| Extracted audio | `public/jobs/{jobId}/audio.mp3` |
| Aligned captions | `public/jobs/{jobId}/aligned.json` |
| Diagnostics | `public/jobs/{jobId}/result.json` |
| Preview render | `out/jobs/{jobId}/preview.mp4` |

### `aligned.json`

```json
[
  {
    "text": "Creating",
    "onsetMs": 219,
    "startMs": 219,
    "endMs": 539
  }
]
```

- `onsetMs`: display time (ElevenLabs `start` in ms, clamped with 50ms minimum gap)
- `startMs` / `endMs`: raw ElevenLabs word boundaries in ms

### `result.json`

```json
{
  "jobId": "abc123",
  "mode": "full",
  "input": {
    "video": "...",
    "languageInput": "auto",
    "patchPath": null
  },
  "media": {
    "fps": 30,
    "width": 1920,
    "height": 1080,
    "durationSec": 10.9,
    "sourceDurationMs": 10900,
    "durationInFrames": 329
  },
  "output": {
    "alignedJson": ".../aligned.json",
    "previewMp4": ".../preview.mp4"
  },
  "diagnostics": {
    "wordCount": 28,
    "correctedWordCount": 0,
    "averageDeltaMs": 0,
    "maxDeltaMs": 0,
    "suspiciousRegions": [],
    "detectedLanguage": "eng"
  }
}
```

## Web App Integration

1. Set `ELEVENLABS_API_KEY` in the server environment.
2. Call `subtitle-pipeline.mjs` from your API route (or agent) as a child process.
3. Poll by `jobId` — read `result.json` for completion status.
4. Show `preview.mp4` in UI for user feedback.
5. If timing is off, send a patch JSON to patch mode.
6. Persist approved `aligned.json` as the final subtitles source of truth.
