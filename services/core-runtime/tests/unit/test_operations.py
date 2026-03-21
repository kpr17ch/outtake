from core.domain.assets import AssetRegistry, ExternalFileReference
from core.domain.entities import Track
from core.domain.state import EditGraphState
from core.domain.time import RationalTime, TimeRange
from core.ops.builtin_timeline_ops import InsertClipOperation, TrimClipOperation


def build_state() -> EditGraphState:
    registry = AssetRegistry()
    media = ExternalFileReference(
        file_path="./media/a.mp4",
        format_hint="mp4",
        available_range=TimeRange(RationalTime(0, 25), RationalTime(500, 25)),
    )
    registry.register(media)
    track = Track(
        id="track-1",
        kind="track",
        schema_version="1.0.0",
        track_type="video",
        item_ids=[],
        name="V1",
    )
    return EditGraphState(
        project_meta={"name": "demo"},
        tracks=[track],
        entities={},
        asset_registry=registry,
        schema_version="1.0.0",
    )


def test_insert_clip_operation() -> None:
    state = build_state()
    media_id = next(iter(state.asset_registry.assets.keys()))
    op = InsertClipOperation(
        op_type="insert_clip",
        actor="ai",
        payload={
            "track_id": "track-1",
            "position": 0,
            "media_ref_id": media_id,
            "source_in": {"value": 0, "rate": 25},
            "source_out": {"value": 100, "rate": 25},
            "clip_id": "clip-1",
        },
    )
    delta = op.apply(state)
    assert "clip-1" in state.entities
    assert state.tracks[0].item_ids == ["clip-1"]
    assert delta.added == ["clip-1"]


def test_trim_clip_operation() -> None:
    state = build_state()
    media_id = next(iter(state.asset_registry.assets.keys()))
    insert = InsertClipOperation(
        op_type="insert_clip",
        actor="ai",
        payload={
            "track_id": "track-1",
            "position": 0,
            "media_ref_id": media_id,
            "source_in": {"value": 0, "rate": 25},
            "source_out": {"value": 100, "rate": 25},
            "clip_id": "clip-1",
        },
    )
    insert.apply(state)
    trim = TrimClipOperation(
        op_type="trim_clip",
        actor="ai",
        payload={
            "clip_id": "clip-1",
            "source_in": {"value": 10, "rate": 25},
            "source_out": {"value": 80, "rate": 25},
        },
    )
    trim.apply(state)
    clip = state.entities["clip-1"]
    assert clip.source_in.value == 10
    assert clip.source_out.value == 80
