from __future__ import annotations

from pathlib import Path


def versioned_path(original: str, version: int) -> str:
    src = Path(original)
    stem = src.stem
    suffix = src.suffix
    candidate = f"{stem}_v{version}{suffix}"
    return str(Path("/workspace") / candidate)
