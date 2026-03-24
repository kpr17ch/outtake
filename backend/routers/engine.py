from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.services.engine_proxy_client import EngineProxyClient
from backend.services.sessions import get_session

router = APIRouter()
client = EngineProxyClient()


def _ensure_session(session_id: str) -> None:
    if not get_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")


@router.post("/api/sessions/{session_id}/undo")
def undo(session_id: str) -> dict:
    _ensure_session(session_id)
    return client.undo(session_id)


@router.post("/api/sessions/{session_id}/redo")
def redo(session_id: str) -> dict:
    _ensure_session(session_id)
    return client.redo(session_id)


@router.get("/api/sessions/{session_id}/history")
def history(session_id: str) -> dict:
    _ensure_session(session_id)
    return client.history(session_id)
