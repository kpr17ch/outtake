from core.domain.assets import AssetRegistry, ExternalFileReference
from core.domain.entities import Track
from core.domain.state import EditGraphState
from core.domain.time import RationalTime, TimeRange
from core.engine import EditEngine
from core.ops.builtin_timeline_ops import InsertClipOperation


def build_state() -> EditGraphState:
    registry = AssetRegistry()
    media = ExternalFileReference(
        file_path="./media/a.mp4",
        format_hint="mp4",
        available_range=TimeRange(RationalTime(0, 25), RationalTime(500, 25)),
    )
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


def test_engine_undo_insert() -> None:
    state = build_state()
    engine = EditEngine()
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
    engine.apply(op, state)
    assert "clip-1" in state.entities
    engine.undo(state)
    assert "clip-1" not in state.entities
