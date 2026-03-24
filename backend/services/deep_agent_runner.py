"""Deep Agents backend: create_deep_agent + FilesystemBackend + official skills paths."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from backend.services.agent_model import resolve_deep_agent_model
from backend.services.agent_tools import run_skill_command_tool
from backend.services.engine_proxy_client import EngineProxyClient
from backend.services.engine_proxy_tools import tools_from_engine_list
from backend.services.mcp_engine_tools import load_mcp_tools_routed_to_engine

logger = logging.getLogger(__name__)


def create_outtake_deep_agent(
    client: EngineProxyClient,
    session_id: str,
    system_prompt: str,
    project_root: Path,
    workspace_path: Path,
):
    """Compiled deep agent with MCP-routed FFmpeg tools (via Engine-Proxy) and run_skill_command."""
    from deepagents import create_deep_agent
    from deepagents.backends.filesystem import FilesystemBackend

    tools: list[Any] = [run_skill_command_tool(project_root, workspace_path)]
    try:
        tools.extend(load_mcp_tools_routed_to_engine(session_id, client))
    except Exception as exc:
        logger.warning("MCP tools unavailable, using Engine-Proxy list_tools: %s", exc)
        tools.extend(tools_from_engine_list(session_id, client))

    # FilesystemBackend: built-in `execute` is not a sandbox shell — use `run_skill_command` for node/npx/python.
    backend = FilesystemBackend(root_dir="/app", virtual_mode=True)
    skills = ["skills"]

    model = resolve_deep_agent_model()

    return create_deep_agent(
        model=model,
        tools=tools,
        system_prompt=system_prompt,
        skills=skills,
        backend=backend,
    )
