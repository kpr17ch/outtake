from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.services.sessions import get_session, update_session
from backend.services.settings_store import load_settings, masked_settings, save_settings

router = APIRouter()


@router.get("/api/sessions/{session_id}/settings")
def get_settings(session_id: str) -> dict:
    if not get_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return masked_settings(load_settings(session_id))


@router.patch("/api/sessions/{session_id}/settings")
async def patch_settings(session_id: str, payload: dict) -> dict:
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    current_provider = load_settings(session_id).provider
    updated = save_settings(session_id, payload)
    if updated.provider != current_provider:
        update_session(session_id, {"agentSessionId": ""})
    return masked_settings(updated)
