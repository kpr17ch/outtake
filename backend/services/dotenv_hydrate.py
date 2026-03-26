"""Fill missing os.environ entries from app/.env (bind-mounted in Docker).

Docker injects env_file only when the container is *created*. If the user adds
GROQ_API_KEY etc. later, the running process often still has no key until
recreate. Reading app/.env on each agent run fixes that without restart.
"""

from __future__ import annotations

import os
from pathlib import Path


def hydrate_missing_from_app_env(project_root: Path) -> None:
    path = (project_root / "app" / ".env").resolve()
    if not path.is_file():
        return
    try:
        from dotenv import dotenv_values
    except ImportError:
        return
    try:
        data = dotenv_values(path)
    except OSError:
        return
    for key, val in data.items():
        if not key or val is None:
            continue
        s = str(val).strip()
        if not s:
            continue
        cur = os.environ.get(key)
        if cur is None or not str(cur).strip():
            os.environ[key] = s
