# Animated subtitles — details

Composition id: **`SubtitleJobPreview`**. Registered in `src/Root.tsx`.

## Render command shape

`captionsSrc` is relative to `public/` — typically `jobs/<jobId>/aligned.json`.

```bash
cd <project_root> && npx remotion render src/index.ts SubtitleJobPreview <workspace>/output/<name>_subtitles.mp4 \
  --props '{"videoSrc":"<basename>","captionsSrc":"jobs/<job_id>/aligned.json","durationInFrames":<n>,"fps":<fps>,"width":<w>,"height":<h>}'
```

Replace `<n>`, `<fps>`, `<w>`, `<h>` from the asset (ffprobe or editor context).

## Transcription

```bash
node <project_root>/transcribe-pipeline.mjs --video <video> --jobId <job_id> --fps <fps> --skipRender
```

Artifacts:

- `public/jobs/<jobId>/aligned.json`
- `public/jobs/<jobId>/result.json`

## Patch timings (optional)

```bash
node <project_root>/transcribe-pipeline.mjs --mode patch --jobId <job_id> --patch <patch_file.json>
```

Patch file example:

```json
{
  "wordShifts": [{"index": 5, "shiftMs": -60}],
  "rangeShifts": [{"fromMs": 5000, "toMs": 7000, "shiftMs": 30}],
  "locks": [0, 1, 2]
}
```
