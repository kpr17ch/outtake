from __future__ import annotations

import sys
from pathlib import Path
from threading import Lock

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CORE_RUNTIME_ROOT = PROJECT_ROOT / "services" / "core-runtime"
ENGINE_PROXY_ROOT = PROJECT_ROOT / "services" / "engine-proxy"

for root in (CORE_RUNTIME_ROOT, ENGINE_PROXY_ROOT):
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))

from core.domain.assets import AssetRegistry  # type: ignore
from core.domain.state import EditGraphState  # type: ignore
from core.engine import EditEngine  # type: ignore
from core.serialization.serializer import StateSerializer  # type: ignore
from core.storage.cas import ContentStore  # type: ignore
from core.storage.project_store import ProjectStore  # type: ignore
from http_mcp_client import HttpMcpClient  # type: ignore
from proxy import EngineProxy  # type: ignore


class EngineSession:
    def __init__(self, workspace_path: Path):
        project_dir = workspace_path / "project"
        project_dir.mkdir(parents=True, exist_ok=True)
        self.store = ProjectStore(project_dir / "project.outtake")
        self.content_store = ContentStore(project_dir)
        snapshot = self.store.load_state()
        if snapshot is not None:
            self.state = StateSerializer(target_schema_version=snapshot["schema_version"]).from_mapping(snapshot)
        else:
            self.state = EditGraphState(
                project_meta={"name": "outtake"},
                tracks=[],
                entities={},
                asset_registry=AssetRegistry(),
                schema_version="1.0.0",
            )
            self.store.save_state(self.state)
        self.engine = EditEngine(store=self.store)
        done, undone = self.store.load_undo_stack()
        if done or undone:
            self.engine.undo_redo = self.engine.undo_redo.from_persistable(done, undone)

        ffmpeg_url = "http://ffmpeg-mcp:8100"
        self.proxy = EngineProxy(
            engine=self.engine,
            state=self.state,
            clients={"ffmpeg": HttpMcpClient(ffmpeg_url)},
            store=self.store,
            content_store=self.content_store,
        )
        self.proxy.discover_tools()
        self.lock = Lock()


_sessions: dict[str, EngineSession] = {}
_global_lock = Lock()


def get_engine_session(session_id: str, workspace_path: Path) -> EngineSession:
    with _global_lock:
        sess = _sessions.get(session_id)
        if sess is None:
            sess = EngineSession(workspace_path)
            _sessions[session_id] = sess
        return sess
