from __future__ import annotations

import base64
import json
import os
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from langchain_core.messages import HumanMessage, SystemMessage

from backend.services.agent_tools import run_skill_command_tool, skill_disclosure_tools
from backend.services.debug_session_log import append_ndjson
from backend.services.engine_proxy_client import EngineProxyClient
from backend.services.engine_proxy_tools import tools_from_engine_list
from backend.services.mcp_engine_tools import load_mcp_tools_routed_to_engine
from backend.services.dotenv_hydrate import hydrate_missing_from_app_env
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
        "Call **`load_skill`** with `skill_id` (folder name from the index, e.g. `video-gen`). The tool also accepts `seed_id` as a synonym. Then **`run_skill_command`** for shell steps (cwd=`project` or `workspace`).",
        "",
        f"- Input: `{ws}/input/`",
        f"- Output: `{ws}/output/`",
        "",
        "## Running Skills",
        "",
        f"- Transcription: `node {pr}/transcribe-pipeline.mjs --video <abs_path> --jobId <id> --skipRender` (omit --skipRender only if user needs Remotion preview MP4)",
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


def _deepagents_delegation_tail(_project_root: Path, workspace_path: Path) -> str:
    ws = str(workspace_path.resolve())
    return (
        "## Deep Agents: subagent delegation\n\n"
        "- For **long or multi-step** jobs (transcription plus file copies, or full Remotion renders), prefer the built-in **`task`** tool: "
        "delegate to **`transcription-worker`**, **`remotion-worker`**, or **`video-gen-worker`**. "
        "They isolate context and return **one final report** (paths, jobId, exit codes, stderr).\n"
        "- For a **single short** shell line, call **`run_skill_command`** directly.\n"
        f"- Subagent final reports must list absolute output paths under `{ws}` when writing to the workspace, "
        "and surface any JSON error line from `transcribe-pipeline.mjs` on stderr.\n"
    )



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
        "If the user explicitly asks to execute now (not explain), do at least one real tool call and avoid tutorial-only answers.\n\n"
        "Before Node/Remotion/Python skill steps, run a quick preflight command to check required binaries; "
        "if missing and user asked for a short test clip, fall back to a deterministic ffmpeg 5s clip in workspace/output.\n\n"
        "Never claim success unless output file existence/metadata was verified by tool output.\n\n"
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


GROQ_TOOL_CAPABLE_MODELS = {
    "llama-3.1-8b-instant",
    "llama-3.3-70b-versatile",
    "llama3-70b-8192",
    "llama3-8b-8192",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "compound-beta",
    "compound-beta-mini",
}
GROQ_FALLBACK_MODEL = "llama-3.3-70b-versatile"


def _groq_safe_model(model: str) -> str:
    if model in GROQ_TOOL_CAPABLE_MODELS:
        return model
    for prefix in ("llama-3", "meta-llama/llama-4", "openai/gpt-oss", "compound"):
        if model.startswith(prefix):
            return model
    return GROQ_FALLBACK_MODEL


def _missing_llm_api_key_hint() -> str | None:
    """Return a user-facing hint if the active provider has no API key (avoids opaque ConnectionError)."""
    p = os.environ.get("AGENT_PROVIDER", "openai").lower()
    keys = {
        "openai": ("OPENAI_API_KEY", os.environ.get("OPENAI_API_KEY")),
        "anthropic": ("ANTHROPIC_API_KEY", os.environ.get("ANTHROPIC_API_KEY")),
        "google": ("GOOGLE_API_KEY", os.environ.get("GOOGLE_API_KEY")),
        "groq": ("GROQ_API_KEY", os.environ.get("GROQ_API_KEY")),
    }
    if p not in keys:
        p = "openai"
    name, val = keys[p]
    if val and str(val).strip():
        return None
    return (
        f"no {name} set for AGENT_PROVIDER={p}. "
        f"Add it to app/.env for Docker, or open Settings in the UI, choose the provider, paste the API key, and click Save Provider."
    )


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
        safe = _groq_safe_model(model)
        llm = ChatGroq(model=safe, api_key=os.environ.get("GROQ_API_KEY"))
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


def _debug_log_invoke_summary_0985cd(messages: list[Any], final: str, backend: str) -> None:
    """NDJSON for debug session 0985cd: actual tool names/args vs model final text (H2/H4)."""
    invocations: list[dict[str, Any]] = []
    for m in messages:
        for t in getattr(m, "tool_calls", None) or []:
            if isinstance(t, dict):
                name = str(t.get("name", ""))
                args = t.get("args", {})
            else:
                name = str(getattr(t, "name", ""))
                args = getattr(t, "args", {})
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except Exception:
                    args = {"_raw": args[:200]}
            row: dict[str, Any] = {"name": name}
            if isinstance(args, dict):
                if "skill_id" in args:
                    row["skill_id"] = args.get("skill_id")
                if "seed_id" in args:
                    row["seed_id"] = args.get("seed_id")
                if "command" in args and name == "run_skill_command":
                    row["command_preview"] = str(args.get("command", ""))[:200]
            invocations.append(row)
    # #region agent log
    append_ndjson(
        {
            "sessionId": "0985cd",
            "hypothesisId": "H2-H4",
            "location": "agent_runner.run_agent",
            "message": "invoke_done",
            "data": {
                "backend": backend,
                "message_count": len(messages),
                "tool_invocations": invocations,
                "final_preview": (final or "")[:800],
            },
        }
    )
    # #endregion


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
    hydrate_missing_from_app_env(project_root)
    client = EngineProxyClient()
    tool_events: list[ToolEvent] = []

    backend = os.environ.get("AGENT_BACKEND", "langgraph").lower()
    full_system = _compose_system_prompt(
        system_prompt,
        project_root,
        workspace_path,
        editor_context,
        include_skills_index=True,
    )
    if backend == "deepagents":
        full_system = full_system + "\n\n" + _deepagents_delegation_tail(project_root, workspace_path)

    # #region agent log
    _sk = discover_skills(project_root)
    append_ndjson(
        {
            "sessionId": "0985cd",
            "hypothesisId": "H3",
            "location": "agent_runner.run_agent",
            "message": "skills_index_at_run",
            "data": {
                "backend": backend,
                "skill_ids": sorted([e.skill_id for e in _sk]),
                "count": len(_sk),
            },
        }
    )
    # #endregion

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
            _debug_log_invoke_summary_0985cd(messages, final, "deepagents")
        except Exception as exc:
            final = f"Deep Agents execution failed ({exc}). Falling back to deterministic engine tool routing."

    elif backend == "langgraph":
        miss = _missing_llm_api_key_hint()
        if miss:
            final = f"LangGraph execution failed ({miss}). Falling back to deterministic engine tool routing."
        else:
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
                _debug_log_invoke_summary_0985cd(messages, final, "langgraph")
            except Exception as exc:
                # #region agent log
                append_ndjson(
                    {
                        "sessionId": "b6e867",
                        "hypothesisId": "H3-openai-tool-use",
                        "location": "agent_runner.py:langgraph",
                        "message": "langgraph_invoke_failed",
                        "data": {
                            "exc_type": type(exc).__name__,
                            "exc_str": str(exc)[:2000],
                        },
                    }
                )
                # #endregion
                is_tool_use_fail = "tool_use_failed" in str(exc) or "failed_generation" in str(exc)
                provider = os.environ.get("AGENT_PROVIDER", "openai").lower()
                cur_model = os.environ.get("AGENT_MODEL", "")
                if is_tool_use_fail and provider == "groq" and cur_model != GROQ_FALLBACK_MODEL:
                    try:
                        os.environ["AGENT_MODEL"] = GROQ_FALLBACK_MODEL
                        agent = _create_langgraph_agent(client, sid, full_system, project_root, workspace_path)
                        result = agent.invoke({"messages": [user_msg]})
                        messages = result.get("messages", []) if isinstance(result, dict) else []
                        final = str(messages[-1].content) if messages else "No response from LangGraph agent."
                        _debug_log_invoke_summary_0985cd(messages, final, "langgraph_retry")
                    except Exception as retry_exc:
                        final = (
                            f"LangGraph execution failed with {cur_model} (tool_use_failed) and retry "
                            f"with {GROQ_FALLBACK_MODEL} also failed ({retry_exc}). "
                            "Falling back to deterministic engine tool routing."
                        )
                    finally:
                        os.environ["AGENT_MODEL"] = cur_model
                else:
                    final = f"LangGraph execution failed ({exc}). Falling back to deterministic engine tool routing."

    refusal_markers = (
        "unable to execute this task",
        "limitations of the functions",
        "i don't have access to",
        "cannot execute this task",
    )
    should_try_fallback = (
        not final
        or final.startswith("LangGraph execution failed")
        or final.startswith("Deep Agents execution failed")
        or any(m in final.lower() for m in refusal_markers)
    )

    if should_try_fallback:
        op = _extract_operation_from_text(message, workspace_path)
        if op:
            # #region agent log
            append_ndjson(
                {
                    "sessionId": "0985cd",
                    "hypothesisId": "H6-fallback-motion-testclip",
                    "location": "agent_runner.run_agent:fallback",
                    "message": "fallback_operation_selected",
                    "data": {
                        "op_name": op.get("name"),
                        "op_args": op.get("args"),
                        "final_prefix": (final or "")[:120],
                    },
                }
            )
            # #endregion
            call_id = str(uuid.uuid4())
            if op["name"] == "skill/run_skill_command":
                response = run_skill_command_tool(project_root, workspace_path).invoke(op["args"])
            else:
                response = client.call_tool(sid, op["name"], op["args"])
            # #region agent log
            append_ndjson(
                {
                    "sessionId": "0985cd",
                    "hypothesisId": "H6-fallback-motion-testclip",
                    "location": "agent_runner.run_agent:fallback",
                    "message": "fallback_operation_finished",
                    "data": {
                        "op_name": op.get("name"),
                        "response_preview": str(response)[:500],
                    },
                }
            )
            # #endregion
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
        else:
            # #region agent log
            append_ndjson(
                {
                    "sessionId": "0985cd",
                    "hypothesisId": "H6-fallback-motion-testclip",
                    "location": "agent_runner.run_agent:fallback",
                    "message": "fallback_operation_not_selected",
                    "data": {
                        "message_preview": message[:200],
                        "final_prefix": (final or "")[:200],
                    },
                }
            )
            # #endregion

    if os.environ.get("AGENT_DEBUG_PROMPT") == "1":
        final += f"\n\nPrompt length: {len(full_system) + len(message)}"

    return AgentRunResult(session_id=sid, tool_events=tool_events, final_text=final)
