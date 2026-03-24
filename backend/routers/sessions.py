from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, HTTPException

from backend.services.sessions import create_session, delete_session, get_session, list_sessions, update_session

router = APIRouter()


@router.get("/api/sessions")
def get_sessions() -> list[dict]:
    return [asdict(s) for s in list_sessions()]


@router.post("/api/sessions", status_code=201)
async def post_session(payload: dict | None = None) -> dict:
    title = "New Session"
    if payload and isinstance(payload.get("title"), str):
        title = payload["title"]
    session = create_session(title)
    return asdict(session)


@router.get("/api/sessions/{session_id}")
def get_session_by_id(session_id: str) -> dict:
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return asdict(session)


@router.patch("/api/sessions/{session_id}")
async def patch_session(session_id: str, payload: dict) -> dict:
    updated = update_session(session_id, payload)
    if not updated:
        raise HTTPException(status_code=404, detail="Session not found")
    return asdict(updated)


@router.delete("/api/sessions/{session_id}")
def delete_session_by_id(session_id: str) -> dict:
    if not delete_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}
