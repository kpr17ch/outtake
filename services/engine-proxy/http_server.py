from __future__ import annotations

import os
from dataclasses import asdict
from pathlib import Path
from threading import Lock
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from server import load_or_create_project
from http_mcp_client import HttpMcpClient
from proxy import EngineProxy


class ToolCallPayload(BaseModel):
    session_id: str
    op_type: str
    arguments: dict[str, Any] = {}


class SessionPayload(BaseModel):
    session_id: str


class SessionState:
    def __init__(self, workspace_root: Path, session_id: str):
        project_dir = workspace_root / "sessions" / session_id / "project"
        engine, state, store, content_store = load_or_create_project(project_dir)
        ffmpeg_mcp_url = os.environ.get("FFMPEG_MCP_URL", "http://localhost:8100")
        clients = {"ffmpeg": HttpMcpClient(ffmpeg_mcp_url)}
        proxy = EngineProxy(
            engine=engine,
            state=state,
            clients=clients,
            store=store,
            content_store=content_store,
        )
        proxy.discover_tools()
        self.engine = engine
        self.state = state
        self.store = store
        self.proxy = proxy
        self.lock = Lock()


app = FastAPI(title="outtake-engine-proxy", version="0.1.0")
WORKSPACE_ROOT = Path(os.environ.get("WORKSPACE_ROOT", "/workspace")).resolve()
_sessions: dict[str, SessionState] = {}
_sessions_lock = Lock()


def _get_session(session_id: str) -> SessionState:
    with _sessions_lock:
        sess = _sessions.get(session_id)
        if sess is None:
            sess = SessionState(WORKSPACE_ROOT, session_id)
            _sessions[session_id] = sess
        return sess


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/engine/tools/list")
def list_tools(payload: SessionPayload) -> dict[str, Any]:
    sess = _get_session(payload.session_id)
    with sess.lock:
        tools = sess.proxy.discover_tools()
    return {"tools": tools}


@app.post("/engine/tools/call")
def call_tool(payload: ToolCallPayload) -> dict[str, Any]:
    sess = _get_session(payload.session_id)
    with sess.lock:
        response = sess.proxy.call_tool(payload.op_type, payload.arguments)
    return {"result": response.result}


@app.post("/engine/undo")
def undo(payload: SessionPayload) -> dict[str, Any]:
    sess = _get_session(payload.session_id)
    with sess.lock:
        sess.engine.undo(sess.state)
    return {"status": "ok"}


@app.post("/engine/redo")
def redo(payload: SessionPayload) -> dict[str, Any]:
    sess = _get_session(payload.session_id)
    with sess.lock:
        sess.engine.redo(sess.state)
    return {"status": "ok"}


@app.get("/engine/history/{session_id}")
def get_history(session_id: str) -> dict[str, Any]:
    sess = _get_session(session_id)
    return {"history": [asdict(e) for e in sess.engine.log.entries()]}


@app.get("/engine/state/{session_id}")
def get_state(session_id: str) -> dict[str, Any]:
    sess = _get_session(session_id)
    return {"state": sess.state.canonical_dict()}


@app.get("/engine/file-versions/{session_id}/{origin_ref_id}")
def get_file_versions(session_id: str, origin_ref_id: str) -> dict[str, Any]:
    sess = _get_session(session_id)
    versions = sess.store.list_file_versions(origin_ref_id)
    if not versions:
        raise HTTPException(status_code=404, detail="No versions for origin_ref_id")
    return {"versions": versions}
