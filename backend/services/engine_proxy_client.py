from __future__ import annotations

import json
import os
from typing import Any
from urllib import request
from urllib.error import HTTPError


def _read_json(req: request.Request, timeout: int) -> dict[str, Any]:
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        try:
            detail = exc.read().decode("utf-8", errors="replace")
        except Exception:
            detail = str(exc.reason)
        raise RuntimeError(f"engine-proxy HTTP {exc.code}: {detail[:4000]}") from exc


class EngineProxyClient:
    def __init__(self, base_url: str | None = None):
        self.base_url = (base_url or os.environ.get("ENGINE_PROXY_URL") or "http://engine-proxy:8200").rstrip("/")

    def list_tools(self, session_id: str) -> list[dict[str, Any]]:
        payload = {"session_id": session_id}
        req = request.Request(
            f"{self.base_url}/engine/tools/list",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        body = _read_json(req, 60)
        tools = body.get("tools")
        if isinstance(tools, list):
            return tools
        return []

    def call_tool(self, session_id: str, op_type: str, arguments: dict[str, Any]) -> dict[str, Any]:
        payload = {"session_id": session_id, "op_type": op_type, "arguments": arguments}
        req = request.Request(
            f"{self.base_url}/engine/tools/call",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        body = _read_json(req, 120)
        return body.get("result", {})

    def undo(self, session_id: str) -> dict[str, Any]:
        return self._post("/engine/undo", {"session_id": session_id})

    def redo(self, session_id: str) -> dict[str, Any]:
        return self._post("/engine/redo", {"session_id": session_id})

    def history(self, session_id: str) -> dict[str, Any]:
        req = request.Request(f"{self.base_url}/engine/history/{session_id}", method="GET")
        return _read_json(req, 60)

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        req = request.Request(
            f"{self.base_url}{path}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        return _read_json(req, 60)
