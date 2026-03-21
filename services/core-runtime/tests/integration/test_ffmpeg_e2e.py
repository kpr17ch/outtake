from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

from core.domain.assets import AssetRegistry, ExternalFileReference
from core.domain.file_versions import FileVersionStore
from core.domain.state import EditGraphState
from core.domain.time import RationalTime, TimeRange
from core.engine import EditEngine
from core.storage.cas import ContentStore
from core.storage.project_store import ProjectStore


def _wait_http(url: str, timeout_s: float = 10.0) -> None:
    import urllib.request

    start = time.time()
    payload = b'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"pytest","version":"1.0"}}}'
    while time.time() - start < timeout_s:
        try:
            req = urllib.request.Request(
                f"{url}/mcp",
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=1):
                return
        except Exception:
            time.sleep(0.2)
    raise TimeoutError(f"MCP HTTP server did not start: {url}")


def test_ffmpeg_proxy_e2e(tmp_path: Path) -> None:
    pytest.importorskip("fastmcp")
    video = Path("/Users/Uni/Desktop/video1360147844.mp4")
    if not video.exists():
        pytest.skip("Test video missing")

    root = Path(__file__).resolve().parents[3]
    engine_proxy_dir = root / "engine-proxy"
    mcp_server_dir = root / "MCP server"
    if str(engine_proxy_dir) not in sys.path:
        sys.path.insert(0, str(engine_proxy_dir))

    from http_mcp_client import HttpMcpClient  # type: ignore[reportMissingImports]
    from proxy import EngineProxy  # type: ignore[reportMissingImports]

    project_dir = tmp_path / "project"
    workspace_dir = project_dir / "workspace"
    workspace_dir.mkdir(parents=True, exist_ok=True)
    input_file = workspace_dir / video.name
    input_file.write_bytes(video.read_bytes())

    env = os.environ.copy()
    env["WORKSPACE_ROOT"] = str(project_dir.resolve())
    proc = subprocess.Popen(
        [sys.executable, str(mcp_server_dir / "server.py")],
        cwd=str(mcp_server_dir),
        env={**env, "PYTHONUNBUFFERED": "1"},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    _wait_http("http://127.0.0.1:8100")
    base_url = "http://127.0.0.1:8100"

    try:
        registry = AssetRegistry()
        media = ExternalFileReference(
            file_path=str(input_file),
            format_hint="mp4",
            available_range=TimeRange(RationalTime(0, 25), RationalTime(1000, 25)),
        )
        media.ref_id = "media-1"
        registry.register(media)
        state = EditGraphState(
            project_meta={"name": "ffmpeg-e2e"},
            tracks=[],
            entities={},
            asset_registry=registry,
            file_versions=FileVersionStore(),
            schema_version="1.0.0",
        )
        state.file_versions.register_version(
            origin_ref_id="media-1",
            ref_id="media-1-v1",
            file_path=str(input_file),
            created_by_op_id="seed-op",
        )

        store = ProjectStore(project_dir / "project.outtake")
        content_store = ContentStore(project_dir)
        engine = EditEngine(store=store)
        proxy = EngineProxy(
            engine=engine,
            state=state,
            clients={"ffmpeg": HttpMcpClient(base_url)},
            store=store,
            content_store=content_store,
        )
        tools = proxy.discover_tools()
        assert any(t["name"] == "ffmpeg/cut_clip" for t in tools)

        out_file = workspace_dir / "video1360147844_v2.mp4"
        proxy.call_tool(
            "ffmpeg/cut_clip",
            {
                "origin_ref_id": "media-1",
                "output_file": str(out_file),
                "start": 0.0,
                "end": 1.0,
            },
        )
        assert out_file.exists()
        active = state.file_versions.get_active_version("media-1")
        assert active.ref_id != "media-1-v1"

        engine.undo(state)
        assert state.file_versions.get_active_version("media-1").ref_id == "media-1-v1"

        engine.redo(state)
        assert state.file_versions.get_active_version("media-1").ref_id != "media-1-v1"
    finally:
        proc.terminate()
        proc.wait(timeout=10)
