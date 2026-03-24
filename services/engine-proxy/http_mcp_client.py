from __future__ import annotations

import json
from typing import Any
from urllib import request
from urllib.error import HTTPError


class HttpMcpClient:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")
        self._id = 0
        self._session_id: str | None = None

    def list_tools(self) -> list[dict]:
        response = self._rpc("tools/list", {})
        tools = response.get("tools")
        if isinstance(tools, list):
            return tools
        if isinstance(response, list):
            return response
        return []

    def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        result = self._rpc("tools/call", {"name": name, "arguments": arguments})
        if isinstance(result, dict):
            if result.get("isError"):
                raise RuntimeError(str(result.get("content", result)))
            if "structuredContent" in result and isinstance(result["structuredContent"], dict):
                return result["structuredContent"]
            content = result.get("content")
            if isinstance(content, list) and content:
                first = content[0]
                if isinstance(first, dict):
                    text = first.get("text")
                    if isinstance(text, str):
                        try:
                            parsed = json.loads(text)
                            if isinstance(parsed, dict):
                                return parsed
                        except json.JSONDecodeError:
                            pass
            return result
        return {"result": result}

    def _rpc(self, method: str, params: dict[str, Any], *, _retry: bool = True) -> dict[str, Any]:
        if self._session_id is None:
            self._initialize_session()
        self._id += 1
        payload = {
            "jsonrpc": "2.0",
            "id": self._id,
            "method": method,
            "params": params,
        }
        body = json.dumps(payload).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        if self._session_id is not None:
            headers["mcp-session-id"] = self._session_id
        req = request.Request(
            f"{self.base_url}/mcp",
            data=body,
            headers=headers,
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=60) as resp:
                raw = resp.read().decode("utf-8")
        except HTTPError as exc:
            # After ffmpeg-mcp restarts, stale mcp-session-id yields 404 on /mcp
            if exc.code == 404 and _retry:
                self._session_id = None
                return self._rpc(method, params, _retry=False)
            raise
        msg = self._decode_response(raw)
        if "error" in msg:
            raise RuntimeError(str(msg["error"]))
        return msg.get("result", {})

    def _initialize_session(self) -> None:
        self._id += 1
        payload = {
            "jsonrpc": "2.0",
            "id": self._id,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "engine-proxy", "version": "1.0"},
            },
        }
        req = request.Request(
            f"{self.base_url}/mcp",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
            },
            method="POST",
        )
        with request.urlopen(req, timeout=60) as resp:
            self._session_id = resp.headers.get("mcp-session-id")
            raw = resp.read().decode("utf-8")
        msg = self._decode_response(raw)
        if "error" in msg:
            raise RuntimeError(str(msg["error"]))
        notify = request.Request(
            f"{self.base_url}/mcp",
            data=json.dumps(
                {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}}
            ).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
                "mcp-session-id": self._session_id or "",
            },
            method="POST",
        )
        with request.urlopen(notify, timeout=60):
            pass

    @staticmethod
    def _decode_response(raw: str) -> dict[str, Any]:
        if raw.lstrip().startswith("{"):
            return json.loads(raw)
        data_lines = [line[6:] for line in raw.splitlines() if line.startswith("data: ")]
        if not data_lines:
            return {}
        return json.loads(data_lines[-1])
