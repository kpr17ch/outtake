from __future__ import annotations

import base64
import os
import re
import subprocess
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field, create_model

from backend.services.engine_proxy_client import EngineProxyClient
from backend.services.skills_loader import discover_skills, format_skills_index, load_skill_body, read_skills_file
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
        "**MCP tools** use absolute paths under the workspace. **Skills** (Remotion, transcribe, video-gen) run via `run_skill_command`.",
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
) -> str:
    block = _workspace_and_skills_block(project_root, workspace_path, editor_context)
    base = system_prompt.strip()
    skills_idx = format_skills_index(discover_skills(project_root))
    tail = "---\nWhen the user asks for motion, Remotion renders, transcription, or Python/Node skills, call the appropriate tools instead of refusing."
    parts = [f"{base}\n\n{block}"]
    if skills_idx.strip():
        parts.append(skills_idx.rstrip())
    parts.append(tail)
    return "\n\n".join(parts)


def _sanitize_tool_name(op_type: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_]+", "_", op_type.replace("/", "_"))
    if safe and safe[0].isdigit():
        safe = "t_" + safe
    return safe or "engine_tool"


def _json_prop_to_field(name: str, spec: dict[str, Any], required: bool) -> tuple[type, Any]:
    desc = str(spec.get("description") or "")
    jtype = spec.get("type")
    if isinstance(jtype, list):
        jtype = next((t for t in jtype if t != "null"), None)
    if jtype == "number":
        py_t = float
    elif jtype == "integer":
        py_t = int
    elif jtype == "boolean":
        py_t = bool
    elif jtype == "array":
        py_t = list[Any]
    else:
        py_t = str

    if "default" in spec:
        d = spec["default"]
        return py_t, Field(default=d, description=desc)
    if required:
        return py_t, Field(..., description=desc)
    return py_t | None, Field(default=None, description=desc)


def _pydantic_model_from_input_schema(op_type: str, input_schema: dict[str, Any]) -> type[BaseModel]:
    props = input_schema.get("properties")
    if not isinstance(props, dict):
        props = {}
    req = set(input_schema.get("required") or [])
    if not isinstance(req, set):
        req = set(req) if isinstance(req, (list, tuple)) else set()
    fields: dict[str, tuple[type, Any]] = {}
    for pname, pspec in props.items():
        if not isinstance(pspec, dict):
            continue
        fields[pname] = _json_prop_to_field(pname, pspec, pname in req)
    model_name = _sanitize_tool_name(op_type) + "_Args"
    if not fields:
        return create_model(model_name, __base__=BaseModel)
    return create_model(model_name, **fields)


def _engine_tool_from_def(
    client: EngineProxyClient,
    session_id: str,
    tool_def: dict[str, Any],
):
    from langchain_core.tools import StructuredTool

    op_type = str(tool_def.get("name") or "")
    description = str(tool_def.get("description") or op_type)
    schema = tool_def.get("inputSchema")
    if not isinstance(schema, dict):
        schema = {"type": "object", "properties": {}}
    props = schema.get("properties")
    has_params = isinstance(props, dict) and bool(props)
    safe_name = _sanitize_tool_name(op_type)

    if not has_params:

        def _call_no_args() -> str:
            return str(client.call_tool(session_id, op_type, {}))

        return StructuredTool.from_function(
            name=safe_name,
            description=description,
            func=_call_no_args,
        )

    args_model = _pydantic_model_from_input_schema(op_type, schema)

    def _call(**kwargs: Any) -> str:
        cleaned = {k: v for k, v in kwargs.items() if v is not None}
        return str(client.call_tool(session_id, op_type, cleaned))

    return StructuredTool.from_function(
        name=safe_name,
        description=description,
        func=_call,
        args_schema=args_model,
    )


def _run_skill_command_tool(project_root: Path, workspace_path: Path):
    from langchain_core.tools import tool

    pr = str(project_root.resolve())
    ws = str(workspace_path.resolve())

    @tool("run_skill_command")
    def run_skill_command(command: str, cwd: str = "project") -> str:
        """Run a Remotion, Node, or Python skill using the shell. cwd='project' uses project root (Remotion, package.json); cwd='workspace' uses the session workspace. Use absolute paths inside the command for files. Example: cd /app && npx remotion render src/index.ts OuttakeMotion /workspace/sessions/.../output/hello.mp4"""
        if cwd not in ("project", "workspace"):
            return "Error: cwd must be 'project' or 'workspace'"
        base = Path(pr if cwd == "project" else ws).resolve()
        try:
            proc = subprocess.run(
                command,
                shell=True,
                cwd=str(base),
                capture_output=True,
                text=True,
                timeout=900,
                env=os.environ.copy(),
            )
        except subprocess.TimeoutExpired:
            return "Error: skill command timed out after 900s"
        except Exception as exc:
            return f"Error running command: {exc}"
        out = (proc.stdout or "") + ((proc.stderr or "") and "\n" + (proc.stderr or ""))
        tail = out[-12000:] if len(out) > 12000 else out
        return f"exit_code={proc.returncode}\n{tail}"

    return run_skill_command


def _skill_disclosure_tools(project_root: Path):
    """Progressive disclosure: index in system prompt; full SKILL.md via tools (Deep Agents pattern)."""
    from langchain_core.tools import tool

    by_id = {e.skill_id: e for e in discover_skills(project_root)}

    @tool("load_skill")
    def load_skill(skill_id: str) -> str:
        """Load full SKILL.md for a skill_id from the Skills index. Call before executing that skill's CLI or workflow."""
        sid = skill_id.strip()
        entry = by_id.get(sid)
        if not entry:
            known = ", ".join(sorted(by_id.keys())) if by_id else "(none)"
            return f"Unknown skill_id `{sid}`. Known: {known}"
        try:
            body = load_skill_body(entry.skill_path)
        except OSError as exc:
            return f"Error reading skill: {exc}"
        if len(body) > 45000:
            return body[:45000] + "\n\n...[truncated]"
        return body

    @tool("read_skill_file")
    def read_skill_file(relative_path: str) -> str:
        """Read a file under skills/ (references, etc.). Path relative to skills/, e.g. video-gen/references/model-reference.md"""
        return read_skills_file(project_root, relative_path.strip())

    return [load_skill, read_skill_file]


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
        llm = ChatOpenAI(model=model, api_key=os.environ.get("OPENAI_API_KEY"))

    tools: list[Any] = [
        _run_skill_command_tool(project_root, workspace_path),
        *_skill_disclosure_tools(project_root),
    ]
    try:
        for td in client.list_tools(session_id):
            if isinstance(td, dict) and td.get("name"):
                tools.append(_engine_tool_from_def(client, session_id, td))
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

    full_system = _compose_system_prompt(system_prompt, project_root, workspace_path, editor_context)

    final = ""
    if os.environ.get("AGENT_BACKEND", "langgraph").lower() == "langgraph":
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

    if not final or final.startswith("LangGraph execution failed"):
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
                "LangGraph backend is active. "
                "No matching operation inferred from message, so no tool was executed."
            )

    if os.environ.get("AGENT_DEBUG_PROMPT") == "1":
        final += f"\n\nPrompt length: {len(full_system) + len(message)}"

    return AgentRunResult(session_id=sid, tool_events=tool_events, final_text=final)
