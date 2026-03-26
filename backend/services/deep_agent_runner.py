"""Deep Agents backend: create_deep_agent + FilesystemBackend + skills + subagents."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from backend.services.agent_model import resolve_deep_agent_model
from backend.services.agent_tools import run_skill_command_tool, skill_disclosure_tools
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
    """Deep agent with MCP tools, load_skill/read_skill_file, run_skill_command, and task subagents."""
    from deepagents import create_deep_agent
    from deepagents.backends.filesystem import FilesystemBackend
    from deepagents.middleware.subagents import SubAgent

    run_tool = run_skill_command_tool(project_root, workspace_path)
    tools: list[Any] = [run_tool, *skill_disclosure_tools(project_root)]
    try:
        tools.extend(load_mcp_tools_routed_to_engine(session_id, client))
    except Exception as exc:
        logger.warning("MCP tools unavailable, using Engine-Proxy list_tools: %s", exc)
        tools.extend(tools_from_engine_list(session_id, client))

    backend = FilesystemBackend(root_dir="/app", virtual_mode=True)
    skills_root = (project_root / "skills").resolve()
    skills_arg: list[str] = [f"{skills_root.as_posix()}/"] if skills_root.is_dir() else []

    pr = str(project_root.resolve())
    ws = str(workspace_path.resolve())

    subagents: list[SubAgent] = [
        {
            "name": "transcription-worker",
            "description": (
                "Transcription and word-level timing via ElevenLabs transcribe-pipeline.mjs. "
                "Use when the user needs aligned.json / captions timing before Remotion."
            ),
            "system_prompt": (
                "You only have run_skill_command. cwd='project' for node/npx under project root; "
                "cwd='workspace' for paths under the session workspace.\n"
                f"Transcription: ensure the video is reachable (copy from `{ws}/input/` to `{pr}/public/` if needed). "
                "Then run:\n"
                f"`node {pr}/transcribe-pipeline.mjs --video <ABSOLUTE_PATH_TO_VIDEO> --jobId <id> --fps <n> --skipRender`\n"
                "Use --skipRender unless the user explicitly wants the Remotion preview MP4.\n"
                "Finish with one report: jobId, paths to aligned.json and result.json, word count, exit_code, "
                "and any stderr line that looks like JSON (pipeline errors)."
            ),
            "tools": [run_tool],
        },
        {
            "name": "remotion-worker",
            "description": (
                "Remotion CLI renders (OuttakeMotion, SubtitleJobPreview, Hello). "
                "Use for motion graphics or subtitle preview MP4 after transcription artifacts exist."
            ),
            "system_prompt": (
                "You only have run_skill_command. cwd='project' for npx remotion.\n"
                f"Render to workspace output, e.g. `{ws}/output/name.mp4`. Example:\n"
                f"`npx remotion render src/index.ts SubtitleJobPreview {ws}/output/preview.mp4 --props '...'`\n"
                "Use absolute paths for the output MP4. Report exit_code, output path, and stderr tail on failure."
            ),
            "tools": [run_tool],
        },
        {
            "name": "video-gen-worker",
            "description": "Replicate Wan 2.6 video generation via skills/video-gen script.",
            "system_prompt": (
                "You only have run_skill_command.\n"
                f"Example: `python {pr}/skills/video-gen/scripts/generate_video.py --prompt 'your prompt' "
                f"-o {ws}/output/clip.mp4 --duration 5`\n"
                "Requires REPLICATE_API_TOKEN in the environment. Report exit_code and output path."
            ),
            "tools": [run_tool],
        },
    ]

    model = resolve_deep_agent_model()

    return create_deep_agent(
        model=model,
        tools=tools,
        system_prompt=system_prompt,
        skills=skills_arg,
        subagents=subagents,
        backend=backend,
    )
