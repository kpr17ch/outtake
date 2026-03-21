#!/usr/bin/env python3
"""
Generate video via Replicate Wan 2.6 (text-to-video or image-to-video).
Requires: pip install replicate

Auth: set REPLICATE_API_TOKEN in the environment, or put it in the skill's
`.env` next to SKILL.md (same folder as `scripts/`): ~/.cursor/skills/wan-video-gen/.env
Existing environment variables are not overwritten by `.env`.
"""
from __future__ import annotations

import argparse
import os
import sys
import urllib.request
from pathlib import Path

MODEL_T2V = "wan-video/wan-2.6-t2v"
MODEL_I2V = "wan-video/wan-2.6-i2v"

# T2V: Replicate validates size to exactly these four strings (422 if wrong).
T2V_ALLOWED_SIZES = frozenset({"1280*720", "720*1280", "1920*1080", "1080*1920"})

# width*height for T2V from --aspect-ratio + --resolution
T2V_SIZE_MAP: dict[tuple[str, str], str] = {
    ("16:9", "720p"): "1280*720",
    ("16:9", "1080p"): "1920*1080",
    ("9:16", "720p"): "720*1280",
    ("9:16", "1080p"): "1080*1920",
}


def _skill_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _load_skill_env() -> None:
    """Load KEY=value pairs from skill `.env` if present (no extra deps)."""
    path = _skill_root() / ".env"
    if not path.is_file():
        return
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        if not key:
            continue
        val = val.strip().strip("'").strip('"')
        if key not in os.environ:
            os.environ[key] = val


def _save_output(output, dest: Path) -> None:
    if hasattr(output, "read"):
        dest.write_bytes(output.read())
        return
    url = str(output).strip()
    if url.startswith("http://") or url.startswith("https://"):
        dest.write_bytes(urllib.request.urlopen(url).read())
        return
    raise TypeError(f"Unexpected output type: {type(output)!r}")


def _open_optional_audio(path: str | None):
    if not path:
        return None
    p = Path(path)
    if not p.is_file():
        sys.exit(f"Audio file not found: {path}")
    return open(p, "rb")


def main() -> None:
    parser = argparse.ArgumentParser(description="Wan 2.6 video via Replicate")
    parser.add_argument("--prompt", required=True, help="Video generation prompt")
    parser.add_argument(
        "-o",
        "--output",
        dest="output",
        required=True,
        help="Output MP4 path",
    )
    parser.add_argument(
        "--image",
        help="Source image for image-to-video (JPEG/PNG/WebP). If set, uses wan-2.6-i2v.",
    )
    parser.add_argument(
        "--duration",
        type=int,
        default=5,
        choices=(5, 10, 15),
        help="Seconds (T2V API allows only 5, 10, or 15)",
    )
    parser.add_argument(
        "--resolution",
        default="720p",
        help="720p or 1080p (T2V size map; I2V resolution). I2V also allows 480p.",
    )
    parser.add_argument(
        "--aspect-ratio",
        default="16:9",
        choices=("16:9", "9:16"),
        help="T2V only: landscape 16:9 or portrait 9:16 (default: 16:9)",
    )
    parser.add_argument(
        "--size",
        help='T2V only: exact API size. Must be one of: 1280*720, 720*1280, 1920*1080, 1080*1920. Overrides --resolution/--aspect-ratio.',
    )
    parser.add_argument("--audio", help="Optional WAV/MP3 path for sync (3–30s, ~≤15MB)")
    parser.add_argument("--negative-prompt", default="", help="Negative prompt")
    parser.add_argument("--seed", type=int, default=None, help="Random seed")
    parser.add_argument(
        "--multi-shots",
        dest="multi_shots",
        action="store_true",
        default=None,
        help="Enable multi-shot (T2V default true if not set; I2V default false)",
    )
    parser.add_argument(
        "--no-multi-shots",
        dest="multi_shots",
        action="store_false",
        help="Disable multi-shot",
    )
    parser.add_argument(
        "--no-prompt-expansion",
        dest="enable_prompt_expansion",
        action="store_false",
        default=True,
        help="Disable prompt optimizer",
    )
    args = parser.parse_args()

    _load_skill_env()
    if not os.environ.get("REPLICATE_API_TOKEN"):
        env_file = _skill_root() / ".env"
        sys.exit(
            "REPLICATE_API_TOKEN is not set. Export it in your shell or create:\n"
            f"  {env_file}\n"
            "with a line: REPLICATE_API_TOKEN=your_token\n"
            "(Copy from .env.example in the same folder.)"
        )

    import replicate

    out_path = Path(args.output).expanduser().resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    audio_f = _open_optional_audio(args.audio)
    try:
        if args.image:
            res = args.resolution.lower()
            if res not in ("480p", "720p", "1080p"):
                sys.exit("I2V --resolution must be 480p, 720p, or 1080p")

            img_path = Path(args.image).expanduser()
            if not img_path.is_file():
                sys.exit(f"Image not found: {args.image}")

            multi = False if args.multi_shots is None else args.multi_shots
            image_cm = open(img_path, "rb")
            try:
                inp = {
                    "image": image_cm,
                    "prompt": args.prompt,
                    "duration": args.duration,
                    "resolution": res,
                    "negative_prompt": args.negative_prompt or "",
                    "enable_prompt_expansion": args.enable_prompt_expansion,
                    "multi_shots": multi,
                }
                if args.seed is not None:
                    inp["seed"] = args.seed
                if audio_f is not None:
                    inp["audio"] = audio_f
                output = replicate.run(MODEL_I2V, input=inp)
            finally:
                image_cm.close()
        else:
            if args.size:
                size = args.size.strip()
            else:
                res = args.resolution.lower()
                if res not in ("720p", "1080p"):
                    sys.exit("T2V --resolution must be 720p or 1080p (or pass --size)")
                key = (args.aspect_ratio, res)
                size = T2V_SIZE_MAP.get(key)
                if not size:
                    sys.exit(
                        f"No T2V size mapping for aspect {args.aspect_ratio} + {res}. "
                        f"Use --size with one of: {', '.join(sorted(T2V_ALLOWED_SIZES))}"
                    )

            if size not in T2V_ALLOWED_SIZES:
                sys.exit(
                    f"Invalid T2V size {size!r}. Must be one of: {', '.join(sorted(T2V_ALLOWED_SIZES))}"
                )

            multi = True if args.multi_shots is None else args.multi_shots
            inp = {
                "prompt": args.prompt,
                "duration": args.duration,
                "size": size,
                "negative_prompt": args.negative_prompt or "",
                "enable_prompt_expansion": args.enable_prompt_expansion,
                "multi_shots": multi,
            }
            if args.seed is not None:
                inp["seed"] = args.seed
            if audio_f is not None:
                inp["audio"] = audio_f

            output = replicate.run(MODEL_T2V, input=inp)
    finally:
        if audio_f is not None:
            audio_f.close()

    _save_output(output, out_path)
    print(str(out_path))


if __name__ == "__main__":
    main()
