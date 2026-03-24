"""Map AGENT_PROVIDER / AGENT_MODEL to deepagents `model=` (provider:model string or BaseChatModel)."""

from __future__ import annotations

import os
from typing import Any


def resolve_deep_agent_model() -> str | Any:
    """Groq returns ChatGroq; other providers use `provider:model` strings for deepagents."""
    provider = os.environ.get("AGENT_PROVIDER", "openai").lower()
    model = os.environ.get("AGENT_MODEL", "gpt-4o-mini")

    if provider == "groq":
        from langchain_groq import ChatGroq

        return ChatGroq(model=model, api_key=os.environ.get("GROQ_API_KEY"))
    if provider == "anthropic":
        return f"anthropic:{model}"
    if provider == "google":
        return f"google_genai:{model}"
    return f"openai:{model}"
