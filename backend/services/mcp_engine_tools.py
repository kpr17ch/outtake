"""Load FFmpeg tools via langchain-mcp-adapters and route execution to Engine-Proxy (EditEngine / undo)."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from langchain_core.tools import BaseTool, StructuredTool

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


def _wrap_mcp_tool_to_engine(base: BaseTool, session_id: str, ep: EngineProxyClient) -> BaseTool:
    op_type = f"ffmpeg/{base.name}"
    desc = (base.description or "").strip() or f"Engine-routed MCP tool ({op_type})"

    def _fn(**kwargs: Any) -> str:
        cleaned = {k: v for k, v in kwargs.items() if v is not None}
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
