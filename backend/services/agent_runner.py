from __future__ import annotations

import base64
import os
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from langchain_core.messages import HumanMessage, SystemMessage

from backend.services.agent_tools import run_skill_command_tool, skill_disclosure_tools
from backend.services.engine_proxy_client import EngineProxyClient
from backend.services.engine_proxy_tools import tools_from_engine_list
from backend.services.mcp_engine_tools import load_mcp_tools_routed_to_engine
from backend.services.skills_loader import discover_skills, format_skills_index
from backend.services.workspace import get_mime_type, resolve_workspace_entry_path


@dataclass
class ToolEvent:
    call_id: str
    name: str
    tool_input: dict[str, Any]
    result: dict[str, Any]


@dataclass
class AgentRunResult:
    session_id: str
    tool_events: list[ToolEvent]
    final_text: str


def _openai_style_image_content(
    message: str,
    image_inputs: list[dict[str, Any]] | None,
    workspace_path: Path,
) -> list[str | dict[str, Any]]:
    """Blocks compatible with OpenAI / Groq vision (image_url). Local /api/workspace/files/ URLs become data URLs."""
    parts: list[str | dict[str, Any]] = [{"type": "text", "text": message}]
    for image in image_inputs or []:
        if not isinstance(image, dict):
            continue
        url = image.get("url")
        if isinstance(url, str):
            if url.startswith("http://") or url.startswith("https://"):
                parts.append({"type": "image_url", "image_url": {"url": url}})
            elif "/api/workspace/files/" in url:
                parsed = urlparse(url)
                rel = parsed.path.split("/api/workspace/files/", 1)[-1].lstrip("/")
                resolved = resolve_workspace_entry_path(workspace_path, rel)
                if resolved and resolved.is_file():
                    data = base64.b64encode(resolved.read_bytes()).decode("ascii")
                    mime = get_mime_type(resolved.name)
                    parts.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{data}"}})
        elif isinstance(image.get("base64"), str):
            mime = str(image.get("mimeType") or "image/png")
            b64 = image["base64"]
            parts.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}})
    return parts


def _workspace_and_skills_block(
    project_root: Path,
    workspace_path: Path,
    editor_context: dict[str, Any] | None,
) -> str:
    pr = str(project_root.resolve())
    ws = str(workspace_path.resolve())
    lines = [
        "## Your Workspace",
        "",
        f"Workspace: `{ws}`",
        f"Project root: `{pr}`",
        "",
        "**MCP tools** use absolute paths under the workspace. **Skills** are listed in the Skills index below (`skills/<skill_id>/SKILL.md`). "
        "Call **`load_skill`** with that `skill_id` for full instructions, then **`run_skill_command`** for shell steps (cwd=`project` or `workspace`).",
        "",
        f"- Input: `{ws}/input/`",
        f"- Output: `{ws}/output/`",
        "",
        "## Running Skills",
        "",
        f"- Transcription: `node {pr}/transcribe-pipeline.mjs --video <abs_path> --jobId <id>`",
        f"- Remotion render: `cd {pr} && npx remotion render src/index.ts <CompositionId> {ws}/output/<name>.mp4`",
        f"- Video generation: `python {pr}/skills/video-gen/scripts/generate_video.py -o {ws}/output/<name>.mp4`",
        f"- Remotion compositions: `Hello` (simple text), `OuttakeMotion`, `SubtitleJobPreview` — see `src/Root.tsx`.",
        f"- PNG frame sequence → MP4 (example): `ffmpeg -y -framerate 30 -pattern_type glob -i '{ws}/output/frame_*.png' -c:v libx264 -pix_fmt yuv420p {ws}/output/frames.mp4` (cwd=workspace).",
        "",
    ]
    if editor_context:
        if editor_context.get("activeVideo"):
            lines.append(f"Active video (basename): **{editor_context.get('activeVideo')}**")
        avp = editor_context.get("activeVideoPath")
        if isinstance(avp, str) and avp:
            lines.append(f"Active video path: `{ws}/{avp}`")
        if editor_context.get("duration") is not None:
            lines.append(f"Duration (s): {editor_context.get('duration')}")
        if editor_context.get("fps") is not None:
            lines.append(f"FPS: {editor_context.get('fps')}")
        sel = editor_context.get("selection")
        if isinstance(sel, dict) and "inSeconds" in sel and "outSeconds" in sel:
            lines.append(
                f"Selection: {float(sel['inSeconds']):.2f}s → {float(sel['outSeconds']):.2f}s"
            )
        lines.append("")
    return "\n".join(lines)


def _compose_system_prompt(
    system_prompt: str,
    project_root: Path,
    workspace_path: Path,
    editor_context: dict[str, Any] | None,
    *,
    include_skills_index: bool = True,
) -> str:
    block = _workspace_and_skills_block(project_root, workspace_path, editor_context)
    base = system_prompt.strip()
    tail = (
        "---\n"
        "When the user asks for motion, Remotion renders, transcription, or Python/Node skills, call the appropriate tools instead of refusing.\n\n"
        "**Tool calling:** `run_skill_command` must receive a real shell string in `command` only (you may chain with `&&`). "
        "Do not put markdown, 'Usage' sections, or documentation into tool arguments — run `load_skill` first, then emit separate "
        "tool calls with actual `node …`, `npx …`, or `python …` commands using absolute paths from the workspace block."
    )
    parts = [f"{base}\n\n{block}"]
    if include_skills_index:
        skills_idx = format_skills_index(discover_skills(project_root))
        if skills_idx.strip():
            parts.append(skills_idx.rstrip())
    parts.append(tail)
    return "\n\n".join(parts)


def _create_langgraph_agent(
    client: EngineProxyClient,
    session_id: str,
    system_prompt: str,
    project_root: Path,
    workspace_path: Path,
):
    from langgraph.prebuilt import create_react_agent
    from langchain_openai import ChatOpenAI
    from langchain_anthropic import ChatAnthropic
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain_groq import ChatGroq

    provider = os.environ.get("AGENT_PROVIDER", "openai").lower()
    model = os.environ.get("AGENT_MODEL", "gpt-4o-mini")

    if provider == "anthropic":
        llm = ChatAnthropic(model=model, api_key=os.environ.get("ANTHROPIC_API_KEY"))
    elif provider == "google":
        llm = ChatGoogleGenerativeAI(model=model, google_api_key=os.environ.get("GOOGLE_API_KEY"))
    elif provider == "groq":
        llm = ChatGroq(model=model, api_key=os.environ.get("GROQ_API_KEY"))
    else:
        llm = ChatOpenAI(
            model=model,
            api_key=os.environ.get("OPENAI_API_KEY"),
            model_kwargs={"parallel_tool_calls": False},
        )

    tools: list[Any] = [
        run_skill_command_tool(project_root, workspace_path),
        *skill_disclosure_tools(project_root),
    ]
    try:
        tools.extend(load_mcp_tools_routed_to_engine(session_id, client))
    except Exception:
        try:
            tools.extend(tools_from_engine_list(session_id, client))
        except Exception:
            pass

    return create_react_agent(
        model=llm,
        tools=tools,
        prompt=SystemMessage(content=system_prompt),
    )


def _extract_operation_from_text(message: str, workspace_path: Path) -> dict[str, Any] | None:
    msg = message.lower()
    if "trim" in msg or "cut" in msg:
        out = workspace_path / "output" / "clip_trim.mp4"
        return {
            "name": "ffmpeg/cut_clip",
            "args": {
                "origin_ref_id": "active_video",
                "output_file": str(out),
                "start": 0.0,
                "end": 5.0,
            },
        }
    return None


def run_agent(
    *,
    message: str,
    project_root: Path,
    workspace_path: Path,
    session_id: str | None,
    system_prompt: str,
    editor_context: dict[str, Any] | None = None,
    image_inputs: list[dict[str, Any]] | None = None,
) -> AgentRunResult:
    sid = session_id or str(uuid.uuid4())
    client = EngineProxyClient()
    tool_events: list[ToolEvent] = []

    backend = os.environ.get("AGENT_BACKEND", "langgraph").lower()
    full_system = _compose_system_prompt(
        system_prompt,
        project_root,
        workspace_path,
        editor_context,
        include_skills_index=(backend != "deepagents"),
    )

    final = ""
    if backend == "deepagents":
        try:
            from backend.services.deep_agent_runner import create_outtake_deep_agent

            agent = create_outtake_deep_agent(
                client,
                sid,
                full_system,
                project_root,
                workspace_path,
            )
            content = _openai_style_image_content(
                message, image_inputs if isinstance(image_inputs, list) else None, workspace_path
            )
            user_msg = HumanMessage(content=content)
            result = agent.invoke({"messages": [user_msg]})
            messages = result.get("messages", []) if isinstance(result, dict) else []
            final = str(messages[-1].content) if messages else "No response from deep agent."
        except Exception as exc:
            final = f"Deep Agents execution failed ({exc}). Falling back to deterministic engine tool routing."

    elif backend == "langgraph":
        try:
            agent = _create_langgraph_agent(
                client,
                sid,
                full_system,
                project_root,
                workspace_path,
            )
            content = _openai_style_image_content(
                message, image_inputs if isinstance(image_inputs, list) else None, workspace_path
            )
            user_msg = HumanMessage(content=content)
            result = agent.invoke({"messages": [user_msg]})
            messages = result.get("messages", []) if isinstance(result, dict) else []
            final = str(messages[-1].content) if messages else "No response from LangGraph agent."
        except Exception as exc:
            final = f"LangGraph execution failed ({exc}). Falling back to deterministic engine tool routing."

    if not final or final.startswith("LangGraph execution failed") or final.startswith(
        "Deep Agents execution failed"
    ):
        op = _extract_operation_from_text(message, workspace_path)
        if op:
            call_id = str(uuid.uuid4())
            response = client.call_tool(sid, op["name"], op["args"])
            tool_events.append(
                ToolEvent(
                    call_id=call_id,
                    name=op["name"],
                    tool_input=op["args"],
                    result=response,
                )
            )
            suffix = (
                "Operation executed through EditEngine.\n\n"
                f"Tool: {op['name']}\n"
                f"Result: {response}"
            )
            final = f"{final}\n\n{suffix}".strip() if final else suffix
        elif not final:
            final = (
                "Agent backend is active. "
                "No matching operation inferred from message, so no tool was executed."
            )

    if os.environ.get("AGENT_DEBUG_PROMPT") == "1":
        final += f"\n\nPrompt length: {len(full_system) + len(message)}"

    return AgentRunResult(session_id=sid, tool_events=tool_events, final_text=final)
