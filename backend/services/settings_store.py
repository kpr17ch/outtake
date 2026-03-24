from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path

from backend.services.workspace import SESSIONS_ROOT


@dataclass
class SessionSettings:
    provider: str = "openai"
    model: str = "gpt-4o-mini"
    apiKey: str = ""


def _settings_path(session_id: str) -> Path:
    return SESSIONS_ROOT / session_id / "settings.json"


def load_settings(session_id: str) -> SessionSettings:
    path = _settings_path(session_id)
    if not path.exists():
        return SessionSettings()
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return SessionSettings()
    return SessionSettings(
        provider=parsed.get("provider") if isinstance(parsed.get("provider"), str) else "openai",
        model=parsed.get("model") if isinstance(parsed.get("model"), str) else "gpt-4o-mini",
        apiKey=parsed.get("apiKey") if isinstance(parsed.get("apiKey"), str) else "",
    )


def save_settings(session_id: str, updates: dict) -> SessionSettings:
    current = load_settings(session_id)
    if isinstance(updates.get("provider"), str):
        current.provider = updates["provider"]
    if isinstance(updates.get("model"), str):
        current.model = updates["model"]
    if isinstance(updates.get("apiKey"), str):
        current.apiKey = updates["apiKey"]
    path = _settings_path(session_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(asdict(current), indent=2), encoding="utf-8")
    return current


def masked_settings(settings: SessionSettings) -> dict:
    key = settings.apiKey
    masked = ""
    if key:
        if len(key) <= 8:
            masked = "*" * len(key)
        else:
            masked = f"{key[:4]}***{key[-4:]}"
    return {"provider": settings.provider, "model": settings.model, "apiKey": masked}
