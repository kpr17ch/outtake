from pathlib import Path

from core.domain.assets import AssetRegistry, ExternalFileReference
from core.domain.entities import Track
from core.domain.state import EditGraphState
from core.domain.time import RationalTime, TimeRange
from core.engine import EditEngine
from core.ops.builtin_timeline_ops import InsertClipOperation
from core.serialization.serializer import StateSerializer
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


def test_state_hash_persistence_roundtrip(tmp_path: Path) -> None:
    db_path = tmp_path / "project.outtake"
    store = ProjectStore(db_path)
    engine = EditEngine(store=store)
    state = _mk_state()

    op = InsertClipOperation(
        op_type="insert_clip",
        actor="ai",
        payload={
            "track_id": "track-1",
            "position": 0,
            "media_ref_id": "media-1",
            "source_in": {"value": 0, "rate": 25},
            "source_out": {"value": 100, "rate": 25},
            "clip_id": "clip-1",
        },
    )
    engine.apply(op, state)

    loaded = store.load_state()
    assert loaded is not None
    restored = StateSerializer(target_schema_version="1.0.0").from_mapping(loaded)
    assert restored.state_hash == state.state_hash
