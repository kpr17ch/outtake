---
name: wan-video-gen
description: >-
  Generate AI videos from text prompts or still images using Alibaba Wan 2.6 on
  Replicate (text-to-video and image-to-video). Use when the user asks to
  generate videos, animate an image, create clips for social or marketing,
  storyboard motion, or any automated video generation from prompts or references.
---

# Wan 2.6 video generation (Replicate)

## Prerequisites

1. **Replicate API token** (from [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens)):
   - **CLI helper** (`scripts/generate_video.py`): create **`~/.cursor/skills/wan-video-gen/.env`** with  
     `REPLICATE_API_TOKEN=...` (see `.env.example` in that folder).  
     Or export `REPLICATE_API_TOKEN` in your shell; the shell wins if both are set.
   - **Inline Python** in your own code: set the env var or load `.env` yourself.
2. **Python**: `pip install replicate`

## Quick start (Python SDK)

**Text-to-video** — model `wan-video/wan-2.6-t2v`:

```python
import replicate

output = replicate.run(
    "wan-video/wan-2.6-t2v",
    input={
        "prompt": "Slow dolly-in on a rainy city street at night, neon reflections, cinematic",
        "duration": 10,
        "size": "1920*1080",
        "multi_shots": True,
        "enable_prompt_expansion": True,
        "negative_prompt": "",
    },
)
# Save MP4 (handles FileOutput or URL string depending on client version)
from pathlib import Path
import urllib.request

def save_video(out, path: str) -> None:
    data = out.read() if hasattr(out, "read") else urllib.request.urlopen(str(out)).read()
    Path(path).write_bytes(data)

save_video(output, "out.mp4")
```

**Image-to-video** — model `wan-video/wan-2.6-i2v` (reuse `save_video` from the snippet above):

```python
output = replicate.run(
    "wan-video/wan-2.6-i2v",
    input={
        "image": open("frame.jpg", "rb"),
        "prompt": "Slow camera push-in; leaves drift in the wind; natural motion",
        "duration": 5,
        "resolution": "1080p",
        "multi_shots": False,
        "enable_prompt_expansion": True,
        "negative_prompt": "",
    },
)
save_video(output, "animated.mp4")
```

**Optional audio** (both models): pass `audio` as a public HTTPS URL or an open file (`open("track.mp3", "rb")`). WAV/MP3, about 3–30s, max ~15MB — aligns video/audio per model rules.

## CLI helper (recommended)

From this skill directory:

```bash
export REPLICATE_API_TOKEN=r8_...
python scripts/generate_video.py --prompt "..." --duration 10 --resolution 1080p --aspect-ratio 16:9 -o out.mp4
python scripts/generate_video.py --prompt "..." --image photo.jpg --duration 5 --resolution 1080p -o clip.mp4
python scripts/generate_video.py --prompt "..." --audio voice.mp3 -o dubbed.mp4
```

See `scripts/generate_video.py --help`.

## API shapes (important)

| Mode | Model | Size / resolution |
|------|--------|-------------------|
| Text-to-video | `wan-video/wan-2.6-t2v` | **`size`** = `"WIDTH*HEIGHT"` (e.g. `1920*1080`, `1280*720`). Not separate `resolution` + `aspect_ratio` in the API. |
| Image-to-video | `wan-video/wan-2.6-i2v` | **`resolution`**: `480p`, `720p`, or `1080p`. |

Default T2V size in the hosted schema is often `1280*720`. Use the mapping table below when using `--resolution` / `--aspect-ratio` with the helper script.

### T2V `size` and `duration` (Replicate validation)

**`duration`** must be **5, 10, or 15** (not 3).

**`size`** must be exactly one of:

- `1280*720` (16:9 landscape 720p)
- `1920*1080` (16:9 landscape 1080p)
- `720*1280` (9:16 portrait 720p)
- `1080*1920` (9:16 portrait 1080p)

The helper maps `--aspect-ratio` + `--resolution` to these, or use `--size` explicitly.

| Aspect | 720p | 1080p |
|--------|------|-------|
| 16:9 | `1280*720` | `1920*1080` |
| 9:16 | `720*1280` | `1080*1920` |

### Shared inputs (both models)

- `prompt` (required)
- `duration` — typically **5, 10, or 15** seconds
- `negative_prompt` — optional; keep under ~500 chars if used
- `enable_prompt_expansion` — default **true**; set **false** if you need strict, literal prompts
- `multi_shots` — T2V: multi-shot segments (works with prompt expansion). I2V: often **false** unless you need segmented motion
- `seed` — optional reproducibility
- `audio` — optional sync

Output: **MP4** URI (24fps, native audio generation/sync per model docs).

## Video prompting guide (quality)

Principles compiled from Wan 2.6 product docs and community guides ([fal Wan 2.6 prompt guide](https://fal.ai/learn/devs/wan-2-6-prompt-guide-mastering-all-three-generation-modes), [wan26 prompt guide](https://www.wan26.info/wan2.6-prompt-guide)).

### Formulas

- **Text-to-video (default):** **Subject + Scene + Motion** → add **lighting + lens + style** for stronger control.
- **Rich T2V:** **Subject (detail) + Scene (detail) + Motion (detail) + aesthetic + stylization**.
- **Image-to-video:** **Motion + camera** — do not re-describe the whole scene; say what moves and how the camera behaves.

### Multi-shot (T2V)

Use time brackets and one block per shot. Keep continuity (same character, wardrobe, location) explicit.

```text
Cinematic, photoreal, shallow depth of field.

Shot 1 [0-3s] Wide establishing shot: empty warehouse, single overhead practical light, slow pan right.
Shot 2 [3-7s] Tracking shot following a woman in a red coat walking between pillars; rain visible at the doorway.
Shot 3 [7-10s] Close-up on her eyes as she stops; subtle handheld micro-movement.
```

### Camera vocabulary (prefer verbs over vague adjectives)

push in, pull out, pan left/right, tilt up/down, orbit, track, follow, dolly zoom, crane up/down, handheld, locked-off, FPV

### Lighting and look

- Sources: daylight, neon, moonlight, practicals, firelight, overcast
- Quality: soft light, hard light, rim light, top light, side light
- Times: golden hour, blue hour, night, midday
- Grade: warm tones, cold tones, high contrast, low saturation, film grain

### Dialogue and lip-sync

Write **exact spoken lines in quotes** in the prompt and describe mouth/performance: e.g. She says: "We ship today." — lips sync, clear enunciation.

### Negative prompts

Use **short** lists of artifacts: `blurry, distorted faces, extra fingers, watermark, text overlay, jitter, warped geometry` — do not contradict the main scene.

### Prompt expansion

With `enable_prompt_expansion: true`, short prompts become richer (good for exploration). For **pixel-specific** instructions (legal, branding, exact words), set `enable_prompt_expansion: false` and write the full prompt yourself.

## Agent workflow

1. Decide **T2V vs I2V** (still frame to animate → I2V).
2. Pick **duration** (5/10/15) and **resolution** / **size**.
3. Draft prompt using formulas above; add **audio** only if needed.
4. Run **one** generation; inspect MP4; iterate with changed **seed** or prompt.
5. For long stories: chain **multiple clips** in an editor (Remotion, FFmpeg, etc.) — one API call is one short generation.

## Troubleshooting

- **401 / auth errors:** `REPLICATE_API_TOKEN` missing or invalid.
- **Wrong shape:** T2V needs **`size`**, I2V needs **`resolution`** — do not swap them.
- **Heavy motion:** describe **camera** and **physics** explicitly; reduce conflicting instructions.
- **Reference-to-video** with `@Video1` etc. may exist on other providers; on Replicate, confirm current `wan-video` model README before relying on extra inputs not listed in [llms.txt](https://replicate.com/wan-video/wan-2.6-t2v/llms.txt).

## More detail

See [references/model-reference.md](references/model-reference.md) for parameter tables, size presets, and extended prompting dictionary.
