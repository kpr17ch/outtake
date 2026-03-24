"""Configurable MCP HTTP servers for langchain-mcp-adapters (extensible list)."""

from __future__ import annotations

import os
from typing import Any


def ffmpeg_mcp_url() -> str:
    base = os.environ.get("FFMPEG_MCP_URL", "http://ffmpeg-mcp:8100").rstrip("/")
    return base if base.endswith("/mcp") else f"{base}/mcp"


def mcp_servers_config() -> dict[str, dict[str, Any]]:
    """Build MultiServerMCPClient config. Add further servers here."""
    return {
        "ffmpeg": {
            "transport": "http",
            "url": ffmpeg_mcp_url(),
        },
    }
