---
name: sound-effects
description: Generate sound effects from text descriptions using ElevenLabs. Use when creating sound effects, generating audio textures, producing ambient sounds, cinematic impacts, UI sounds, or any audio that isn't speech. Includes copy-paste prompt templates (transitions, explosions/motion, epic energy and crowd), looping, duration control, and prompt influence tuning.
license: MIT
compatibility: Requires internet access and an ElevenLabs API key (ELEVENLABS_API_KEY).
metadata: {"openclaw": {"requires": {"env": ["ELEVENLABS_API_KEY"]}, "primaryEnv": "ELEVENLABS_API_KEY"}}
---

# ElevenLabs Sound Effects

Generate sound effects from text descriptions — supports looping, custom duration, and prompt adherence control.

> **Setup:** See [Installation Guide](references/installation.md). For JavaScript, use `@elevenlabs/*` packages only.

## Where to set `ELEVENLABS_API_KEY`

The skill file **never** contains your key (by design). The variable must exist in the **process environment** when code or cURL runs.

| Where | What to do |
|-------|------------|
| **Cursor (Agent / terminal tools)** | Add `ELEVENLABS_API_KEY` under **Cursor Settings → Environment** (or your build’s “Agent env” / MCP env, depending on version), **or** launch Cursor from a terminal where you ran `export ELEVENLABS_API_KEY=...`. |
| **Project** | Put `ELEVENLABS_API_KEY=...` in repo-root `.env` (gitignored) or copy `.env.example` → `.env` in this folder. Your app/script must load it (e.g. `dotenv`) or you export it in the shell before `node`/`python`. |
| **One-off terminal** | `export ELEVENLABS_API_KEY="..."` in that session. |

The ElevenLabs SDKs pick up `ELEVENLABS_API_KEY` automatically if you use the default client constructors (see [Installation Guide](references/installation.md)).

## Quick Start

### Python

```python
from elevenlabs import ElevenLabs

client = ElevenLabs()

audio = client.text_to_sound_effects.convert(
    text="Thunder rumbling in the distance with light rain",
)

with open("thunder.mp3", "wb") as f:
    for chunk in audio:
        f.write(chunk)
```

### JavaScript

```javascript
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { createWriteStream } from "fs";

const client = new ElevenLabsClient();
const audio = await client.textToSoundEffects.convert({
  text: "Thunder rumbling in the distance with light rain",
});
audio.pipe(createWriteStream("thunder.mp3"));
```

### cURL

```bash
curl -X POST "https://api.elevenlabs.io/v1/sound-generation" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" -H "Content-Type: application/json" \
  -d '{"text": "Thunder rumbling in the distance with light rain"}' \
  --output thunder.mp3
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `text` | string (required) | — | Description of the desired sound effect |
| `model_id` | string | `eleven_text_to_sound_v2` | Model to use |
| `duration_seconds` | number \| null | null (auto) | Duration 0.5–30s; auto-calculated if null |
| `prompt_influence` | number \| null | 0.3 | **Higher** = follows the prompt **more literally** and outputs are **less random**. **Lower** = more variation / surprise. Range 0–1 (per [API docs](https://www.elevenlabs.io/docs/api-reference/text-to-sound-effects/convert)). |
| `loop` | boolean | false | Seamlessly looping SFX (`eleven_text_to_sound_v2` only). Describe a sound that *can* loop (steady ambience, idle hum), not a one-shot crash. |

### When to set `duration_seconds` vs leave it `null`

- **`null` (auto):** Let the model pick length from the prompt — good for vague ideas (“thunder storm”).
- **Fixed duration (0.5–30 s):** Use when the clip must hit an edit, game loop, or UI timing (e.g. `1.0` s notification, `10.0` s bed).

## Examples with Parameters

```python
# Looping ambient sound, 10 seconds
audio = client.text_to_sound_effects.convert(
    text="Gentle forest ambiance with birds chirping",
    duration_seconds=10.0,
    prompt_influence=0.5,
    loop=True,
)

# Short UI sound, high prompt adherence
audio = client.text_to_sound_effects.convert(
    text="Soft notification chime",
    duration_seconds=1.0,
    prompt_influence=0.8,
)
```

## Output Formats

Pass `output_format` as a query parameter (cURL) or SDK parameter:

| Format | Description |
|--------|-------------|
| `mp3_44100_128` | MP3 44.1kHz 128kbps (default) |
| `pcm_44100` | Raw uncompressed CD quality |
| `opus_48000_128` | Opus 48kHz 128kbps — efficient compressed |
| `ulaw_8000` | μ-law 8kHz — telephony |

Full list: `mp3_22050_32`, `mp3_24000_48`, `mp3_44100_32`, `mp3_44100_64`, `mp3_44100_96`, `mp3_44100_128`, `mp3_44100_192`, `pcm_8000`, `pcm_16000`, `pcm_22050`, `pcm_24000`, `pcm_32000`, `pcm_44100`, `pcm_48000`, `ulaw_8000`, `alaw_8000`, `opus_48000_32`, `opus_48000_64`, `opus_48000_96`, `opus_48000_128`, `opus_48000_192`.

## Prompting guide (sound effects)

Write **natural-language** descriptions of the sound. Community and product guides agree: **specificity beats one-word prompts** — call out *what* makes the sound, *where* it lives in space, and *how it evolves in time*.

### Checklist (layer these into one prompt)

| Layer | What to add | Example |
|-------|-------------|---------|
| **Source / material** | What is making the noise? | “metal door”, “glass clink”, “leather creak” |
| **Scale & energy** | Size and intensity | “small”, “massive”, “soft tap”, “deafening” |
| **Space / acoustics** | Room or outdoor character | “dry close-mic”, “large cathedral reverb”, “open field” |
| **Distance** | Near vs far | “right beside the listener”, “distant”, “passing overhead” |
| **Time / motion** | How the sound changes | “fades in slowly”, “quick attack then long decay”, “builds to a crash” |
| **Genre / context** | Intended use | “horror sting”, “retro 8-bit jump”, “trailer braam”, “clean UI click” |
| **Onomatopoeia** | Optional clarity | Pair words like *whoosh*, *clang* with a normal description — helps lock the gesture |

### Weak vs strong prompts

| Avoid | Prefer |
|-------|--------|
| “Rain” | “Steady moderate rain on a tin roof, close perspective, subtle drips at the edges” |
| “Explosion” | “Short controlled explosion, debris falling on concrete, outdoor, slight echo off buildings” |
| “Wind” | “Low howling wind through a cracked window in an empty room, unsettling, builds slowly” |

### Official-style phrasing (API examples)

ElevenLabs’ own docs use **full scene + intent** in one line, e.g. *“Spacious braam suitable for high-impact movie trailer moments”* — combine **sonic adjectives** with **where it will be used**.

### `prompt_influence` in practice

- **~0.2–0.4:** Explore variations; good when you are brainstorming SFX.
- **~0.5–0.7:** Balanced; default **0.3** is a safe starting point.
- **~0.8–1.0:** Lock onto a very literal reading of the text; use when the wording is already precise.

### Looping prompts

For `loop=True`, describe **stable, repeating energy** (fan hum, engine idle, rain bed). Avoid one-shots (“gunshot”, “single door slam”) unless you want a jarring loop.

## Prompt templates (ready to paste)

Curated from common **transition**, **explosion / motion**, and **epic energy / crowd** styles (shortened for clarity). Adjust wording to taste; tune `prompt_influence` if results are too loose (**↑**) or too literal (**↓**).

Each template lists **suggested API fields** — minimum duration via API is **0.5 s** (use `0.5` even if the creative brief says “350 ms”).

### Transitions (4 examples)

#### T1 — Cartoon airy vehicle pass (playful, no sci-fi buzz)

| Suggested | Value |
|-----------|--------|
| `duration_seconds` | `1.8`–`2.2` |
| `prompt_influence` | `0.65`–`0.8` |

```text
Cartoon-style SFX of a flying robot airplane with no electronic or sci-fi tones. Smooth, airy whoosh “shwoooong~” or “fwoooosh~”, with a gentle rise and natural fade-out. Light, fast, slightly playful, like slicing through air. No buzzing, no synth — pure wind swoosh with a warm, rounded cartoon quality. A little faster than a typical glide.
```

#### T2 — Soft silk / minimal feminine whoosh

| Suggested | Value |
|-----------|--------|
| `duration_seconds` | `2.0` (or `0.5`–`0.8` for a very short bed) |
| `prompt_influence` | `0.55`–`0.72` |

```text
A very soft, slow, airy whoosh. Feminine, minimal, like silk moving in the air. No harsh attack, no harsh finish — smooth edges, long natural decay. Delicate, breathable, elegant transition.
```

#### T3 — Quick UI / screen change (YouTube, apps)

| Suggested | Value |
|-----------|--------|
| `duration_seconds` | `0.8`–`1.2` |
| `prompt_influence` | `0.7`–`0.85` |

```text
A quick “swoosh” for switching one screen to another in a YouTube or app UI: fast, precise, airy, clean stereo, no reverb tail, no music, no voice. Modern, neutral, professional transition.
```

#### T4 — Chill explainer / tutorial transition (optimal for “talking head” edits)

| Suggested | Value |
|-----------|--------|
| `duration_seconds` | `1.0`–`1.4` |
| `prompt_influence` | `0.62`–`0.75` |

```text
Chill educational video transition: soft warm airy whoosh, calm and friendly, like turning a page or a gentle breeze in a quiet room. Minimal, clean stereo — no music, no voice, no harsh highs, no aggressive impact. Professional explainer or tutorial vibe: relaxed focus, subtle forward motion, smooth attack and soft natural tail. Neutral-warm, modern “explain this” YouTube energy without sounding corporate or sci-fi.
```

### Explosions & high-energy motion (3 examples)

*Includes tension “drops” and projectile motion — not only literal explosions.*

#### E1 — Deep sub tension (gravity sink, no hit)

| Suggested | Value |
|-----------|--------|
| `duration_seconds` | `5.0` |
| `prompt_influence` | `0.75`–`0.9` |

```text
Deep bass dive. Smooth downward motion, no impact. Very soft sub bass falling slowly, like pressure sinking inward. No explosion, no hit, no EDM drop. Clean, controlled cinematic tension — dark but calm, powerful but restrained. No distortion, no growl, no sharp transients, no highs. Slow start, deep middle, gentle release — gravity pulling down, not a crash.
```

#### E2 — Short clean whoosh (e.g. cooking / lifestyle edit)

| Suggested | Value |
|-----------|--------|
| `duration_seconds` | `0.5`–`0.7` |
| `prompt_influence` | `0.72`–`0.88` |

```text
Clean, smooth cinematic whoosh. Airy and light — not aggressive, not metallic. No echo, no long reverb tail, no explosion. Soft fast air sweep, suitable for transitions in a modern cooking or lifestyle YouTube video. Crisp, professional, neutral-warm, not sci-fi, no background noise.
```

#### E3 — Slow-motion bullet pass (air only, no impact)

| Suggested | Value |
|-----------|--------|
| `duration_seconds` | `3.5`–`4.5` |
| `prompt_influence` | `0.65`–`0.8` |

```text
Soft slow-motion air whoosh as a bullet travels through the air — smooth flowing wind, gentle pressure movement, cinematic airy glide. Subtle and clean. No explosion, no impact, no voices.
```

### Epic fantasy energy & crowd hype (3 examples)

*Heavy fantasy / anime-style motion, sports-arena moments, and layered whoosh + crowd beds.*

#### P1 — Colossal energy spear (tearing roar, no whistle)

| Suggested | Value |
|-----------|--------|
| `duration_seconds` | `2.0` |
| `prompt_influence` | `0.72`–`0.88` |

```text
A thick, roaring, upward tearing sound. Like a colossal spear of solid energy punching through the air — a dense rush of distorted wind pressure and low-end roar, with granular texture of cracking stone and shearing force. Pitch rises slightly, but the core feeling is immense weight and power at incredible speed. No whistle, only roar.
```

#### P2 — Soft woosh-boom + ambient stadium cheer

| Suggested | Value |
|-----------|--------|
| `duration_seconds` | `4.0` |
| `prompt_influence` | `0.6`–`0.78` |

```text
A gentle woosh into a soft, rounded boom, then the sound of fans cheering in a large sports stadium — keep the crowd airy and ambient, washed in hall reverb, not close-up chants. The boom should be warm and restrained, not explosive or harsh. No announcer voice, no music bed.
```

#### P3 — Deep downlifter whoosh + distant arena roar

| Suggested | Value |
|-----------|--------|
| `duration_seconds` | `3.5`–`5.0` |
| `prompt_influence` | `0.65`–`0.82` |

```text
Start with a deep cinematic downlifter whoosh lasting about one second — smooth sub-heavy air drop, no harsh click. It resolves into a large distant crowd in a stadium or arena: sustained cheer and room tone, wide stereo, blurred and atmospheric rather than sharp syllables. No whistle lead-in on the downlifter, no music, no voice-of-god PA.
```

## Error Handling

```python
try:
    audio = client.text_to_sound_effects.convert(text="Explosion")
except Exception as e:
    print(f"API error: {e}")
```

Common errors:
- **401**: Invalid API key
- **422**: Invalid parameters (check duration range, prompt_influence range)
- **429**: Rate limit exceeded

## References

- [Installation Guide](references/installation.md)
- [ElevenLabs — Create sound effect (API)](https://www.elevenlabs.io/docs/api-reference/text-to-sound-effects/convert) — parameters and SDK examples
- [ElevenLabs Help — Sound Effects](https://help.elevenlabs.io/hc/en-us/sections/23795027455249-Sound-Effects) — product FAQ
- [Promptomania — ElevenLabs SFX prompting tips](https://promptomania.com/models/elevenlabs/elevenlabs-sfx) — third-party checklist (material, time, space, onomatopoeia)
