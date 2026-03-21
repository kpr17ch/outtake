from core.domain.assets import AssetRegistry, ExternalFileReference
from core.domain.entities import Track
from core.domain.state import EditGraphState
from core.domain.time import RationalTime, TimeRange
from core.engine import EditEngine
from core.ops.builtin_timeline_ops import InsertClipOperation, TrimClipOperation


def mk_state() -> EditGraphState:
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


def test_replay_same_hash() -> None:
    state_a = mk_state()
    state_b = mk_state()
    engine_a = EditEngine()
    engine_b = EditEngine()
    media_a = next(iter(state_a.asset_registry.assets.keys()))
    media_b = next(iter(state_b.asset_registry.assets.keys()))

    ops_a = [
        InsertClipOperation(
            op_type="insert_clip",
            actor="ai",
            payload={
                "track_id": "track-1",
                "position": 0,
                "media_ref_id": media_a,
                "source_in": {"value": 0, "rate": 25},
                "source_out": {"value": 100, "rate": 25},
                "clip_id": "clip-1",
            },
        ),
        TrimClipOperation(
            op_type="trim_clip",
            actor="ai",
            payload={
                "clip_id": "clip-1",
                "source_in": {"value": 10, "rate": 25},
                "source_out": {"value": 90, "rate": 25},
            },
        ),
    ]
    ops_b = [
        InsertClipOperation(
            op_type="insert_clip",
            actor="ai",
            payload={
                "track_id": "track-1",
                "position": 0,
                "media_ref_id": media_b,
                "source_in": {"value": 0, "rate": 25},
                "source_out": {"value": 100, "rate": 25},
                "clip_id": "clip-1",
            },
        ),
        TrimClipOperation(
            op_type="trim_clip",
            actor="ai",
            payload={
                "clip_id": "clip-1",
                "source_in": {"value": 10, "rate": 25},
                "source_out": {"value": 90, "rate": 25},
            },
        ),
    ]

    for op in ops_a:
        engine_a.apply(op, state_a)
    for op in ops_b:
        engine_b.apply(op, state_b)

    assert state_a.state_hash == state_b.state_hash
