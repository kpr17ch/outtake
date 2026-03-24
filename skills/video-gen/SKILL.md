---
name: video-gen
description: AI video generation (Wan 2.6) via Replicate — text-to-video and image-to-video.
tags: replicate, wan, t2v, i2v, generate video
---

# Video generation (Wan 2.6)

Use the CLI helper; auth via `REPLICATE_API_TOKEN` (env or `skills/video-gen/.env`).

## CLI

```bash
python skills/video-gen/scripts/generate_video.py \
  --prompt "Your cinematic prompt" \
  --duration 10 --resolution 1080p --aspect-ratio 16:9 \
  -o <workspace>/output/generated.mp4
```

Image-to-video:

```bash
python skills/video-gen/scripts/generate_video.py \
  --prompt "Motion description" \
  --image /abs/path/to/frame.png \
  --duration 5 --resolution 1080p \
  -o <workspace>/output/i2v.mp4
```

## Constraints

- Duration: **5, 10, or 15** seconds only (API).
- Set paths under the session workspace `output/` for deliverables.

## Reference

Full parameter tables: call `read_skill_file` with `video-gen/references/model-reference.md`.
