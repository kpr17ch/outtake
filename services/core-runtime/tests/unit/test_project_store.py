from pathlib import Path

from core.domain.assets import AssetRegistry, ExternalFileReference
from core.domain.entities import Track
from core.domain.state import EditGraphState
from core.domain.time import RationalTime, TimeRange
from core.history.log import OperationLogEntry
from core.storage.project_store import ProjectStore


def _mk_state() -> EditGraphState:
    registry = AssetRegistry()
    media = ExternalFileReference(
        file_path="./media/a.mp4",
        format_hint="mp4",
        available_range=TimeRange(RationalTime(0, 25), RationalTime(500, 25)),
    )
    media.ref_id = "media-1"
    registry.register(media)
    return EditGraphState(
        project_meta={"name": "demo"},
        tracks=[
            Track(
                id="track-1",
                kind="track",
                schema_version="1.0.0",
                track_type="video",
                item_ids=[],
                name="V1",
            )
        ],
        entities={},
        asset_registry=registry,
        schema_version="1.0.0",
    )


def test_project_store_state_roundtrip(tmp_path: Path) -> None:
    store = ProjectStore(tmp_path / "project.outtake")
    state = _mk_state()
    store.save_state(state)

    loaded = store.load_state()
    assert loaded is not None
    assert loaded["schema_version"] == "1.0.0"
    assert loaded["project_meta"]["name"] == "demo"


def test_project_store_operation_and_file_version(tmp_path: Path) -> None:
    store = ProjectStore(tmp_path / "project.outtake")
    entry = OperationLogEntry(
        op_id="op-1",
        op_type="ffmpeg/cut_clip",
        ts="2026-01-01T00:00:00+00:00",
        actor="ffmpeg",
        causation_id=None,
        correlation_id="corr-1",
        payload={"origin_ref_id": "media-1"},
        tool_schema_hash="abc",
        result_snapshot={"output_file": "/workspace/clip_v2.mp4"},
        file_versions_before={"media-1": "media-1-v1"},
    )
    store.save_operation(entry)
    store.register_file(
        ref_id="media-1-v2",
        origin_ref_id="media-1",
        file_path="/workspace/clip_v2.mp4",
        cas_hash="hash123",
        version=2,
        op_id="op-1",
    )

    operations = store.load_operations()
    versions = store.list_file_versions("media-1")
    assert len(operations) == 1
    assert operations[0].op_type == "ffmpeg/cut_clip"
    assert len(versions) == 1
    assert versions[0]["cas_hash"] == "hash123"
