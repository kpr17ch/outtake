from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1] / "core-runtime"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.domain.assets import AssetRegistry
from core.domain.state import EditGraphState
from core.engine import EditEngine
from proxy import EngineProxy, UpstreamMcpClient


class NullMcpClient(UpstreamMcpClient):
    def list_tools(self) -> list[dict]:
        return []

    def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        _ = name, arguments
        return {"status": "noop"}


def build_state() -> EditGraphState:
    return EditGraphState(
        project_meta={"name": "engine-proxy"},
        tracks=[],
        entities={},
        asset_registry=AssetRegistry(),
        schema_version="1.0.0",
    )


def run_stdio() -> None:
    engine = EditEngine()
    state = build_state()
    clients: dict[str, UpstreamMcpClient] = {
        "ffmpeg": NullMcpClient(),
        "whisperx": NullMcpClient(),
        "media-gen": NullMcpClient(),
    }
    proxy = EngineProxy(engine=engine, state=state, clients=clients)
    proxy.discover_tools()

    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        req = json.loads(raw)
        method = req.get("method")
        request_id = req.get("id")
        try:
            if method == "tools/list":
                result = proxy.discover_tools()
            elif method == "tools/call":
                params = req.get("params", {})
                op_type = params["name"]
                args = params.get("arguments", {})
                response = proxy.call_tool(op_type, args)
                result = response.result
            elif method == "engine/undo":
                engine.undo(state)
                result = {"status": "ok"}
            elif method == "engine/redo":
                engine.redo(state)
                result = {"status": "ok"}
            elif method == "engine/get_history":
                result = [entry.__dict__ for entry in engine.log.entries()]
            elif method == "engine/get_state":
                result = state.canonical_dict()
            else:
                raise KeyError(f"Unknown method: {method}")
            out = {"id": request_id, "result": result}
        except Exception as exc:  # pragma: no cover
            out = {"id": request_id, "error": str(exc)}
        sys.stdout.write(json.dumps(out) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    run_stdio()
