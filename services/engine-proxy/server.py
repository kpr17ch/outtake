from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1] / "core-runtime"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.domain.assets import AssetRegistry
from core.domain.state import EditGraphState
from core.engine import EditEngine
from core.serialization.serializer import StateSerializer
from core.storage.cas import ContentStore
from core.storage.project_store import ProjectStore
from http_mcp_client import HttpMcpClient
from proxy import EngineProxy, UpstreamMcpClient


def load_or_create_project(project_dir: Path) -> tuple[EditEngine, EditGraphState, ProjectStore, ContentStore]:
    project_dir.mkdir(parents=True, exist_ok=True)
    store = ProjectStore(project_dir / "project.outtake")
    content_store = ContentStore(project_dir)
    snapshot = store.load_state()
    if snapshot is not None:
        state = StateSerializer(target_schema_version=snapshot["schema_version"]).from_mapping(snapshot)
    else:
        state = EditGraphState(
            project_meta={"name": "engine-proxy"},
            tracks=[],
            entities={},
            asset_registry=AssetRegistry(),
            schema_version="1.0.0",
        )
        store.save_state(state)
    done, undone = store.load_undo_stack()
    engine = EditEngine(store=store)
    if done or undone:
        engine.undo_redo = engine.undo_redo.from_persistable(done, undone)
    return engine, state, store, content_store


def run_stdio() -> None:
    project_dir = Path("/workspace/project")
    engine, state, store, content_store = load_or_create_project(project_dir)
    ffmpeg_mcp_url = os.environ.get("FFMPEG_MCP_URL", "http://localhost:8100")
    clients: dict[str, UpstreamMcpClient] = {
        "ffmpeg": HttpMcpClient(ffmpeg_mcp_url),
    }
    proxy = EngineProxy(
        engine=engine,
        state=state,
        clients=clients,
        store=store,
        content_store=content_store,
    )
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
            elif method == "engine/save":
                store.save_state(state)
                result = {"status": "ok"}
            elif method == "engine/load":
                params = req.get("params", {})
                selected = Path(params.get("project_dir", "/workspace/project"))
                engine, state, store, content_store = load_or_create_project(selected)
                proxy = EngineProxy(
                    engine=engine,
                    state=state,
                    clients=clients,
                    store=store,
                    content_store=content_store,
                )
                proxy.discover_tools()
                result = {"status": "ok"}
            elif method == "engine/get_file_versions":
                params = req.get("params", {})
                result = store.list_file_versions(params.get("origin_ref_id"))
            else:
                raise KeyError(f"Unknown method: {method}")
            out = {"id": request_id, "result": result}
        except Exception as exc:  # pragma: no cover
            out = {"id": request_id, "error": str(exc)}
        sys.stdout.write(json.dumps(out) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    run_stdio()
