# Wan 2.6 on Replicate — reference

Official model pages:

- Text-to-video: [wan-video/wan-2.6-t2v](https://replicate.com/wan-video/wan-2.6-t2v)
- Image-to-video: [wan-video/wan-2.6-i2v](https://replicate.com/wan-video/wan-2.6-i2v)

Machine-readable summaries: append `/llms.txt` to each model URL.

## Text-to-video (`wan-video/wan-2.6-t2v`)

| Input | Type | Notes |
|--------|------|--------|
| `prompt` | string | Required |
| `size` | string | **Width*height**, e.g. `1280*720`, `1920*1080`. Default commonly `1280*720`. |
| `duration` | integer | Seconds; examples use **5, 10, 15** |
| `multi_shots` | boolean | Multi-shot segmentation; **only meaningful when `enable_prompt_expansion` is true** |
| `enable_prompt_expansion` | boolean | Default **true** — LLM expands short prompts |
| `negative_prompt` | string | Optional |
| `audio` | uri / file | WAV/MP3, ~3–30s, ≤ ~15MB for sync |
| `seed` | integer | Optional |

**Output:** `uri` — MP4 URL (or file handle via SDK).

### Example JSON (from Replicate)

```json
{
  "size": "1280*720",
  "prompt": "Slow-motion dolly zoom on a fearless warrior...",
  "duration": 10,
  "multi_shots": true,
  "negative_prompt": "",
  "enable_prompt_expansion": true
}
```

## Image-to-video (`wan-video/wan-2.6-i2v`)

| Input | Type | Notes |
|--------|------|--------|
| `image` | string (uri) or file | Required; formats per playground (JPEG/PNG typical) |
| `prompt` | string | Required — describe **motion and camera**, not the whole still |
| `resolution` | string | **`480p`**, **`720p`**, or **`1080p`** |
| `duration` | integer | e.g. **5** |
| `multi_shots` | boolean | Often **false** for single continuous motion |
| `enable_prompt_expansion` | boolean | Default **true** |
| `negative_prompt` | string | Optional |
| `audio` | uri / file | Same rules as T2V |
| `seed` | integer | Optional |

### Example JSON (from Replicate)

```json
{
  "image": "https://example.com/frame.jpg",
  "prompt": "The vintage clock on the table starts ticking...",
  "duration": 5,
  "resolution": "720p",
  "multi_shots": false,
  "negative_prompt": "",
  "enable_prompt_expansion": true
}
```

## T2V `size` and `duration` (strict on Replicate)

**`duration`:** must be **5, 10, or 15** (integer seconds).

**`size`:** Replicate returns **422** unless `size` is **exactly** one of:

- `1280*720`, `1920*1080`, `720*1280`, `1080*1920`

No other aspect ratios or resolutions are accepted for `wan-video/wan-2.6-t2v` on this endpoint.

### Presets (used by `generate_video.py`)

| Aspect | 720p | 1080p |
|--------|------|-------|
| 16:9 | `1280*720` | `1920*1080` |
| 9:16 | `720*1280` | `1080*1920` |

API string format: `WIDTH*HEIGHT` (asterisk, no spaces).

## Prompting dictionary (cheat sheet)

### Structure

- **T2V basic:** Subject + scene + motion  
- **T2V advanced:** Subject (detail) + scene (detail) + motion + lighting + lens + style  
- **I2V:** Motion + camera (assume composition is fixed by the image)

### Multi-shot (T2V)

Use explicit beats and timing:

`Shot 1 [0-3s] ... Shot 2 [3-7s] ...`

Keep **identity** consistent (wardrobe, hair, environment) across shots unless the story requires a change.

### Camera verbs

push in, pull out, pan, tilt, orbit, track, follow, dolly zoom, crane, handheld, locked-off, FPV, whip pan, slow pan

### Light

golden hour, blue hour, softbox, hard sunlight, neon spill, rim light, silhouette, volumetric fog, overcast, single practical

### Lens / framing

wide establishing, medium shot, close-up, macro, over-the-shoulder, POV, shallow depth of field, deep focus, anamorphic flare

### Style

documentary, cinematic, commercial, UGC handheld, motion graphics, anime, claymation, noir

### Negative prompt (short)

`blurry, low resolution, distorted face, extra limbs, watermark, subtitles, text, jitter, morphing`

## Mode comparison (conceptual)

| Goal | Model | Notes |
|------|--------|--------|
| From script / idea only | T2V | Use `size` + `multi_shots` as needed |
| Animate still / key art | I2V | Strong still + motion prompt |
| Exact line delivery | Either | Put dialogue in quotes; optional `audio` |
| Fast iteration | Either | Lower resolution / shorter duration first |

## Operational tips

1. **Costs:** Replicate bills by model run time; longer clips and 1080p cost more.  
2. **Retries:** Change `seed` or tweak one variable at a time.  
3. **Content policy:** Hosted models enforce safety; refusals are normal for disallowed content.  
4. **Reference-to-video** (`@Video1` style) is documented for Wan on some providers; **verify Replicate’s current README** before assuming extra inputs beyond `llms.txt`.

## Python client

```bash
pip install replicate
export REPLICATE_API_TOKEN=r8_...
```

```python
import replicate
out = replicate.run("wan-video/wan-2.6-t2v", input={...})
```

See also: [Replicate Python getting started](https://replicate.com/docs/get-started/python).
