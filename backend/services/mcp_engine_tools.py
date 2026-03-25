"""Load FFmpeg tools via langchain-mcp-adapters and route execution to Engine-Proxy (EditEngine / undo)."""

from __future__ import annotations

import asyncio
import logging
import re
from pathlib import Path
from typing import Any

from langchain_core.tools import BaseTool, StructuredTool

from backend.services.debug_session_log import append_ndjson
from backend.services.engine_proxy_client import EngineProxyClient
from backend.services.mcp_config import mcp_servers_config

logger = logging.getLogger(__name__)


def _run_async(coro: Any) -> Any:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    import concurrent.futures

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(lambda: asyncio.run(coro)).result()


async def _aload_mcp_tools_routed_to_engine(session_id: str, ep: EngineProxyClient) -> list[BaseTool]:
    from langchain_mcp_adapters.client import MultiServerMCPClient

    client = MultiServerMCPClient(mcp_servers_config())
    raw = await client.get_tools()
    return [_wrap_mcp_tool_to_engine(t, session_id, ep) for t in raw]


def load_mcp_tools_routed_to_engine(session_id: str, ep: EngineProxyClient) -> list[BaseTool]:
    """Sync entry: fetch MCP tool definitions, execute via EngineProxyClient (ffmpeg/… op types)."""
    return _run_async(_aload_mcp_tools_routed_to_engine(session_id, ep))


_SESSION_PATH = re.compile(r"^(/app/sessions/)([0-9a-f-]{36})(/workspace/.*)$", re.I)


def _normalize_ffmpeg_path_args(session_id: str, args: dict[str, Any]) -> dict[str, Any]:
    """Fix common LLM path mistakes: workplace typo; wrong session UUID copied from an old message."""
    out: dict[str, Any] = {}
    sid = session_id.strip()
    for k, v in args.items():
        if isinstance(v, str):
            nv = v.replace("/workplace/", "/workspace/")
            if nv == v and "workplace" in v and ("/sessions/" in v or v.startswith("/app/")):
                nv = v.replace("workplace", "workspace")
            m = _SESSION_PATH.match(nv)
            if m and m.group(2).lower() != sid.lower():
                nv = f"{m.group(1)}{sid}{m.group(3)}"
            out[k] = nv
        elif isinstance(v, list):
            out[k] = [
                _normalize_one_path_string(sid, x) if isinstance(x, str) else x for x in v
            ]
        else:
            out[k] = v
    return out


def _normalize_one_path_string(session_id: str, v: str) -> str:
    nv = v.replace("/workplace/", "/workspace/")
    if nv == v and "workplace" in v and ("/sessions/" in v or v.startswith("/app/")):
        nv = v.replace("workplace", "workspace")
    m = _SESSION_PATH.match(nv)
    if m and m.group(2).lower() != session_id.lower():
        return f"{m.group(1)}{session_id}{m.group(3)}"
    return nv


def _missing_input_feedback(args: dict[str, Any]) -> str | None:
    """If input paths are missing on disk, return a clear message instead of engine-proxy 502."""
    checks: list[tuple[str, bool]] = [
        ("input_file", False),
        ("input_video", False),
        ("sfx_file", False),
        ("subtitle_file", False),
        ("input_files", True),
    ]
    for key, is_list in checks:
        if key not in args:
            continue
        val = args[key]
        if is_list:
            if not isinstance(val, list):
                continue
            for p in val:
                if isinstance(p, str) and p and not Path(p).exists():
                    return (
                        f"File not found: {p}. Upload the video to this chat session first "
                        "(media bin or drag-and-drop) so it appears under workspace/input/, then retry."
                    )
        elif isinstance(val, str) and val and not Path(val).exists():
            return (
                f"File not found: {val}. Upload the video to this chat session first "
                "(media bin or drag-and-drop) so it appears under workspace/input/, then retry."
            )
    return None


def _wrap_mcp_tool_to_engine(base: BaseTool, session_id: str, ep: EngineProxyClient) -> BaseTool:
    op_type = f"ffmpeg/{base.name}"
    desc = (base.description or "").strip() or f"Engine-routed MCP tool ({op_type})"

    def _fn(**kwargs: Any) -> str:
        cleaned = {k: v for k, v in kwargs.items() if v is not None}
        before = dict(cleaned)
        cleaned = _normalize_ffmpeg_path_args(session_id, cleaned)
        missing = _missing_input_feedback(cleaned)
        # #region agent log
        append_ndjson(
            {
                "sessionId": "b6e867",
                "hypothesisId": "H1-workplace-typo",
                "location": "mcp_engine_tools.py:_fn",
                "message": "mcp_routed_tool",
                "data": {
                    "tool": base.name,
                    "session_id": session_id,
                    "args_before": before,
                    "args_after": cleaned,
                    "normalized": before != cleaned,
                    "preflight_missing_input": missing is not None,
                },
            }
        )
        # #endregion
        if missing is not None:
            return missing
        return str(ep.call_tool(session_id, op_type, cleaned))

    schema = getattr(base, "args_schema", None)
    if schema is not None:
        return StructuredTool.from_function(
            name=base.name,
            description=desc,
            func=_fn,
            args_schema=schema,
        )
    return StructuredTool.from_function(
        name=base.name,
        description=desc,
        func=_fn,
    )
