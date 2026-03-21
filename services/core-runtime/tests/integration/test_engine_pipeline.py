from core.domain.assets import AssetRegistry, ExternalFileReference
from core.domain.entities import Track
from core.domain.state import EditGraphState
from core.domain.time import RationalTime, TimeRange
from core.engine import EditEngine
from core.ops.builtin_timeline_ops import InsertClipOperation


def test_engine_logs_and_events() -> None:
    registry = AssetRegistry()
    media = ExternalFileReference(
        file_path="./media/a.mp4",
        format_hint="mp4",
        available_range=TimeRange(RationalTime(0, 25), RationalTime(500, 25)),
    )
    registry.register(media)
    state = EditGraphState(
        project_meta={},
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
    engine = EditEngine()
    events = []

    class Listener:
        def on_event(self, event):
            events.append(event.event_type)

    engine.events.subscribe(Listener())
    media_id = next(iter(state.asset_registry.assets.keys()))
    op = InsertClipOperation(
        op_type="insert_clip",
        actor="ai",
        payload={
            "track_id": "track-1",
            "position": 0,
            "media_ref_id": media_id,
            "source_in": {"value": 0, "rate": 25},
            "source_out": {"value": 20, "rate": 25},
            "clip_id": "clip-1",
        },
    )
    engine.apply(op, state)
    assert len(engine.log.entries()) == 1
    assert "StateChanged" in events
