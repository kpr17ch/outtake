"""Append NDJSON lines for debug sessions (host path + Docker fallback)."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path


def append_ndjson(payload: dict) -> None:
    """Write to every path that works. In Docker, /app is bind-mounted to the repo — use that first so the host sees logs."""
    payload.setdefault("timestamp", int(time.time() * 1000))
    line = json.dumps(payload, ensure_ascii=False) + "\n"
    paths: list[str] = []
    env = os.environ.get("DEBUG_SESSION_LOG_PATH")
    if env:
        paths.append(env)
    paths.extend(
        [
            "/app/.cursor/debug-b6e867.log",
            "/home/danielt/.cursor/debug-b6e867.log",
            # Session 0985cd (debug mode): repo + Docker host-cursor mount
            "/app/.cursor/debug-0985cd.log",
            "/host-cursor/debug-0985cd.log",
            "/Users/Uni/Desktop/Coding/.cursor/debug-0985cd.log",
        ]
    )
    for p in paths:
        try:
            Path(p).parent.mkdir(parents=True, exist_ok=True)
            with open(p, "a", encoding="utf-8") as f:
                f.write(line)
        except OSError:
            continue
