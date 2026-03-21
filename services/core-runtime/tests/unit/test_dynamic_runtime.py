from core.domain.assets import AssetRegistry, ExternalFileReference
from core.domain.entities import Track
from core.domain.file_versions import FileVersionStore
from core.domain.state import EditGraphState
from core.domain.time import RationalTime, TimeRange
from core.engine import EditEngine
from core.ops.mcp_tool_op import McpToolOperation


def mk_state() -> EditGraphState:
    registry = AssetRegistry()
    media = ExternalFileReference(
        file_path="./raw/cam1.mp4",
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
        file_versions=FileVersionStore(),
        schema_version="1.0.0",
    )


def test_file_version_store_register_and_rollback() -> None:
    store = FileVersionStore()
    v1 = store.register_version(
        origin_ref_id="media-1",
        ref_id="media-1-v1",
        file_path="/workspace/cam1_v1.mp4",
        created_by_op_id="op-1",
    )
    v2 = store.register_version(
        origin_ref_id="media-1",
        ref_id="media-1-v2",
        file_path="/workspace/cam1_v2.mp4",
        created_by_op_id="op-2",
    )
    assert store.get_active_version("media-1").ref_id == v2.ref_id
    rolled = store.rollback_to("media-1", 1)
    assert rolled.ref_id == v1.ref_id
    assert store.get_active_version("media-1").ref_id == v1.ref_id


def test_mcp_tool_operation_apply_updates_active_refs() -> None:
    state = mk_state()
    op = McpToolOperation(
        op_type="ffmpeg/cut_clip",
        actor="ffmpeg",
        payload={"clip_id": "clip-1"},
        state_changes={"active_file_refs": {"media-1": "media-1-v2"}},
    )
    delta = op.apply(state)
    assert delta.modified == ["media-1"]
    assert state.file_versions.active["media-1"] == "media-1-v2"


def test_snapshot_based_undo_and_redo() -> None:
    state = mk_state()
    engine = EditEngine()
    op = McpToolOperation(
        op_type="ffmpeg/cut_clip",
        actor="ffmpeg",
        payload={"origin_ref_id": "media-1"},
        state_changes={"active_file_refs": {"media-1": "media-1-v2"}},
    )
    engine.apply(op, state)
    assert state.file_versions.active.get("media-1") == "media-1-v2"
    engine.undo(state)
    assert "media-1" not in state.file_versions.active
    engine.redo(state)
    assert state.file_versions.active.get("media-1") == "media-1-v2"
