from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from backend.services.agent_runner import run_agent
from backend.services.context import resolve_workspace_context
from backend.services.protocol_adapter import assistant_tool_use, sse_data, user_tool_result
from backend.services.settings_store import load_settings
from backend.services.sessions import update_session

router = APIRouter()


def _load_system_prompt(project_root: Path) -> str:
    path = project_root / "SYSTEM_PROMPT.md"
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return ""


@router.post("/api/chat")
async def post_chat(payload: dict):
    message = payload.get("message")
    session_id = payload.get("sessionId")
    editor_context = payload.get("editorContext")
    image_inputs = payload.get("imageInputs")

    if not isinstance(message, str) or not message.strip():
        raise HTTPException(status_code=400, detail="Missing message")

    workspace = resolve_workspace_context(session_id if isinstance(session_id, str) else None)
    if isinstance(session_id, str) and not workspace:
        raise HTTPException(status_code=404, detail="Session not found")
    if not workspace:
        raise HTTPException(status_code=500, detail="Workspace unavailable")

    project_root = Path(__file__).resolve().parents[2]
    system_prompt = _load_system_prompt(project_root)
    if workspace.session_id:
        settings = load_settings(workspace.session_id)
        import os
        if settings.provider:
            os.environ["AGENT_PROVIDER"] = settings.provider
        if settings.model:
            os.environ["AGENT_MODEL"] = settings.model
        if settings.apiKey:
            if settings.provider == "anthropic":
                os.environ["ANTHROPIC_API_KEY"] = settings.apiKey
            elif settings.provider == "google":
                os.environ["GOOGLE_API_KEY"] = settings.apiKey
            elif settings.provider == "groq":
                os.environ["GROQ_API_KEY"] = settings.apiKey
            else:
                os.environ["OPENAI_API_KEY"] = settings.apiKey

    async def event_stream():
        try:
            result = run_agent(
                message=message.strip(),
                project_root=project_root,
                workspace_path=workspace.workspace_path,
                session_id=workspace.agent_session_id or workspace.session_id,
                system_prompt=system_prompt,
                editor_context=editor_context if isinstance(editor_context, dict) else None,
                image_inputs=image_inputs if isinstance(image_inputs, list) else None,
            )
            if workspace.session_id:
                update_session(workspace.session_id, {"agentSessionId": result.session_id})
            yield sse_data({"type": "system", "subtype": "init", "session_id": result.session_id})
            for tool_event in result.tool_events:
                yield sse_data(assistant_tool_use(tool_event.call_id, tool_event.name, tool_event.tool_input))
                yield sse_data(user_tool_result(tool_event.call_id, tool_event.result))
            yield sse_data({"type": "result", "result": result.final_text})
        except Exception as exc:
            yield sse_data({"type": "error", "message": str(exc)})
            yield sse_data({"type": "result", "result": f"Error: {exc}"})

    headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
    }
    return StreamingResponse(event_stream(), headers=headers, media_type="text/event-stream")
