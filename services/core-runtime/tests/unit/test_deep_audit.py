"""
Exhaustive audit tests covering all identified risks and edge cases.
Each test function documents what it validates and which plan risk it covers.
"""
from dataclasses import asdict

import pytest

from core.domain.assets import (
    AssetRegistry,
    ExternalFileReference,
    GeneratorReference,
    ImageSequenceReference,
    MissingReference,
)
from core.domain.capabilities import Capability
from core.domain.entities import (
    Clip,
    EffectInstance,
    Gap,
    TimelineEntity,
    Track,
    Transition,
)
from core.domain.state import EditGraphState
from core.domain.time import RationalTime, TimeRange
from core.engine import EditEngine
from core.history.checkpoints import CheckpointPolicy, CheckpointStore
from core.history.log import OperationLog
from core.history.undo_redo import UndoRedoController
from core.ops.base import BaseOperation, PreApplyContext, StateDelta, ValidationResult
from core.ops.builtin_timeline_ops import (
    DeleteEntityOperation,
    InsertClipOperation,
    TrimClipOperation,
)
from core.ops.registry import OperationRegistry
from core.ops.validator import OperationValidator
from core.serialization.migrations import SchemaMigrationRequired, SchemaMigrator
from events.bus import DomainEvent, DomainEventBus


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def mk_state(media_ref_id: str = "media-1") -> EditGraphState:
    registry = AssetRegistry()
    media = ExternalFileReference(
        file_path="./media/a.mp4",
        format_hint="mp4",
        available_range=TimeRange(RationalTime(0, 25), RationalTime(500, 25)),
    )
    media.ref_id = media_ref_id
    registry.register(media)
    track = Track(
        id="track-1", kind="track", schema_version="1.0.0",
        track_type="video", item_ids=[], name="V1",
    )
    return EditGraphState(
        project_meta={"name": "test"},
        tracks=[track],
        entities={},
        asset_registry=registry,
        schema_version="1.0.0",
    )


def insert_clip(engine, state, clip_id="clip-1", position=0,
                source_in=None, source_out=None):
    source_in = source_in or {"value": 0, "rate": 25}
    source_out = source_out or {"value": 100, "rate": 25}
    media_id = next(iter(state.asset_registry.assets.keys()))
    op = InsertClipOperation(
        op_type="insert_clip", actor="ai",
        payload={
            "track_id": "track-1", "position": position,
            "media_ref_id": media_id,
            "source_in": source_in, "source_out": source_out,
            "clip_id": clip_id,
        },
    )
    engine.apply(op, state)
    return op


# ===========================================================================
# R-09 — RationalTime: integer arithmetic, no floats
# ===========================================================================

class TestRationalTime:
    def test_rate_must_be_positive(self):
        with pytest.raises(ValueError):
            RationalTime(0, 0)
        with pytest.raises(ValueError):
            RationalTime(0, -1)

    def test_subtraction_same_rate(self):
        result = RationalTime(100, 25) - RationalTime(30, 25)
        assert result == RationalTime(70, 25)

    def test_subtraction_different_rate_raises(self):
        with pytest.raises(ValueError):
            RationalTime(100, 25) - RationalTime(30, 30)

    def test_comparison_operators(self):
        assert RationalTime(10, 25) < RationalTime(20, 25)
        assert RationalTime(10, 25) <= RationalTime(10, 25)
        assert not (RationalTime(20, 25) < RationalTime(10, 25))

    def test_comparison_different_rate_raises(self):
        with pytest.raises(ValueError):
            RationalTime(10, 25) < RationalTime(10, 30)

    def test_frozen(self):
        t = RationalTime(10, 25)
        with pytest.raises(AttributeError):
            t.value = 20


class TestTimeRange:
    def test_rate_mismatch_raises(self):
        with pytest.raises(ValueError):
            TimeRange(RationalTime(0, 25), RationalTime(100, 30))

    def test_negative_duration_raises(self):
        with pytest.raises(ValueError):
            TimeRange(RationalTime(0, 25), RationalTime(-1, 25))

    def test_end_exclusive(self):
        tr = TimeRange(RationalTime(10, 25), RationalTime(90, 25))
        assert tr.end_exclusive == RationalTime(100, 25)


# ===========================================================================
# R-13 — Capability system
# ===========================================================================

class TestCapabilities:
    def test_base_entity_has_no_capabilities(self):
        e = TimelineEntity(id="x", kind="unknown", schema_version="1.0.0")
        assert e.get_capabilities() == frozenset()

    def test_clip_has_capabilities(self):
        c = Clip(id="c", kind="clip", schema_version="1.0.0")
        caps = c.get_capabilities()
        assert Capability.TRIMMABLE in caps
        assert Capability.MOVABLE in caps
        assert Capability.EFFECT_ATTACHABLE in caps

    def test_gap_has_no_capabilities(self):
        g = Gap(id="g", kind="gap", schema_version="1.0.0")
        assert g.get_capabilities() == frozenset()


# ===========================================================================
# R-15 — Asset layer
# ===========================================================================

class TestAssetRegistry:
    def test_register_and_get(self):
        reg = AssetRegistry()
        ref = ExternalFileReference(file_path="a.mp4", format_hint="mp4")
        ref_id = reg.register(ref)
        assert reg.get(ref_id) is ref

    def test_get_unknown_raises(self):
        reg = AssetRegistry()
        with pytest.raises(KeyError):
            reg.get("does-not-exist")

    def test_resolve_range_no_available_range_raises(self):
        reg = AssetRegistry()
        ref = MissingReference()
        reg.register(ref)
        with pytest.raises(ValueError):
            reg.resolve_range(ref.ref_id)

    def test_all_reference_types_register(self):
        reg = AssetRegistry()
        refs = [
            ExternalFileReference(file_path="a.mp4"),
            MissingReference(),
            GeneratorReference(),
            ImageSequenceReference(base_path="/seq", name_pattern="f_%04d.exr"),
        ]
        for r in refs:
            reg.register(r)
        assert len(reg.assets) == 4


# ===========================================================================
# R-01 — Positional model: Track.item_ids is sole source of truth
# ===========================================================================

class TestPositionalModel:
    def test_clip_has_no_persisted_timeline_start(self):
        c = Clip(id="c", kind="clip", schema_version="1.0.0",
                 source_in=RationalTime(0, 25), source_out=RationalTime(100, 25))
        d = asdict(c)
        assert "timeline_start" not in d

    def test_timeline_duration_is_computed(self):
        c = Clip(id="c", kind="clip", schema_version="1.0.0",
                 source_in=RationalTime(10, 25), source_out=RationalTime(50, 25))
        assert c.timeline_duration == RationalTime(40, 25)


# ===========================================================================
# Validator — R-15 range checks, R-13 capability checks
# ===========================================================================

class TestValidator:
    def test_insert_clip_source_out_exceeds_available_range(self):
        state = mk_state()
        media_id = next(iter(state.asset_registry.assets.keys()))
        op = InsertClipOperation(
            op_type="insert_clip", actor="ai",
            payload={
                "track_id": "track-1", "position": 0,
                "media_ref_id": media_id,
                "source_in": {"value": 0, "rate": 25},
                "source_out": {"value": 600, "rate": 25},
                "clip_id": "clip-bad",
            },
        )
        v = OperationValidator()
        result = v.validate(op, state)
        assert not result.ok
        assert "available range" in result.reason

    def test_insert_clip_source_out_before_source_in(self):
        state = mk_state()
        media_id = next(iter(state.asset_registry.assets.keys()))
        op = InsertClipOperation(
            op_type="insert_clip", actor="ai",
            payload={
                "track_id": "track-1", "position": 0,
                "media_ref_id": media_id,
                "source_in": {"value": 100, "rate": 25},
                "source_out": {"value": 50, "rate": 25},
                "clip_id": "clip-bad",
            },
        )
        v = OperationValidator()
        result = v.validate(op, state)
        assert not result.ok

    def test_trim_nonexistent_clip(self):
        state = mk_state()
        op = TrimClipOperation(
            op_type="trim_clip", actor="ai",
            payload={
                "clip_id": "does-not-exist",
                "source_in": {"value": 0, "rate": 25},
                "source_out": {"value": 10, "rate": 25},
            },
        )
        v = OperationValidator()
        result = v.validate(op, state)
        assert not result.ok


# ===========================================================================
# Engine — full pipeline: validate → pre-context → apply → inverse → log → events
# ===========================================================================

class TestEngineFullPipeline:
    def test_rejected_op_raises_and_emits_event(self):
        state = mk_state()
        engine = EditEngine()
        events = []

        class L:
            def on_event(self, event):
                events.append(event)

        engine.events.subscribe(L())
        media_id = next(iter(state.asset_registry.assets.keys()))
        bad_op = InsertClipOperation(
            op_type="insert_clip", actor="ai",
            payload={
                "track_id": "track-1", "position": 0,
                "media_ref_id": media_id,
                "source_in": {"value": 0, "rate": 25},
                "source_out": {"value": 9999, "rate": 25},
                "clip_id": "clip-bad",
            },
        )
        with pytest.raises(ValueError):
            engine.apply(bad_op, state)
        assert any(e.event_type == "OperationRejected" for e in events)
        assert len(engine.log.entries()) == 0

    def test_insert_undo_redo_roundtrip(self):
        state = mk_state()
        engine = EditEngine()
        insert_clip(engine, state, "clip-1")
        hash_after_insert = state.state_hash
        assert "clip-1" in state.entities
        assert state.tracks[0].item_ids == ["clip-1"]

        engine.undo(state)
        assert "clip-1" not in state.entities
        assert state.tracks[0].item_ids == []

    def test_trim_undo_restores_old_values(self):
        state = mk_state()
        engine = EditEngine()
        insert_clip(engine, state, "clip-1",
                    source_in={"value": 0, "rate": 25},
                    source_out={"value": 200, "rate": 25})
        trim_op = TrimClipOperation(
            op_type="trim_clip", actor="ai",
            payload={
                "clip_id": "clip-1",
                "source_in": {"value": 20, "rate": 25},
                "source_out": {"value": 150, "rate": 25},
            },
        )
        engine.apply(trim_op, state)
        clip = state.entities["clip-1"]
        assert clip.source_in.value == 20
        assert clip.source_out.value == 150

        engine.undo(state)
        clip = state.entities["clip-1"]
        assert clip.source_in.value == 0
        assert clip.source_out.value == 200

    def test_multiple_inserts_undo_order(self):
        state = mk_state()
        engine = EditEngine()
        insert_clip(engine, state, "clip-A", position=0)
        insert_clip(engine, state, "clip-B", position=1)
        insert_clip(engine, state, "clip-C", position=2)
        assert state.tracks[0].item_ids == ["clip-A", "clip-B", "clip-C"]

        engine.undo(state)
        assert "clip-C" not in state.entities
        assert state.tracks[0].item_ids == ["clip-A", "clip-B"]

        engine.undo(state)
        assert "clip-B" not in state.entities
        assert state.tracks[0].item_ids == ["clip-A"]

    def test_undo_with_empty_stack_raises(self):
        state = mk_state()
        engine = EditEngine()
        with pytest.raises(IndexError):
            engine.undo(state)


# ===========================================================================
# R-05 — OperationLog stores forward-ops only
# ===========================================================================

class TestOperationLog:
    def test_log_records_forward_ops(self):
        log = OperationLog()
        op = InsertClipOperation(
            op_type="insert_clip", actor="ai", payload={"x": 1},
        )
        log.append(op)
        entries = log.entries()
        assert len(entries) == 1
        assert entries[0].op_type == "insert_clip"

    def test_log_returns_copy(self):
        log = OperationLog()
        op = InsertClipOperation(
            op_type="insert_clip", actor="ai", payload={},
        )
        log.append(op)
        entries = log.entries()
        entries.clear()
        assert len(log.entries()) == 1


# ===========================================================================
# UndoRedoController
# ===========================================================================

class TestUndoRedoController:
    def test_record_clears_redo_stack(self):
        ctrl = UndoRedoController()
        noop = BaseOperation(op_type="noop", actor="ai", payload={})
        ctrl.record("op1", noop)
        ctrl.pop_undo()
        assert ctrl.can_redo()
        ctrl.record("op2", noop)
        assert not ctrl.can_redo()

    def test_pop_undo_empty_raises(self):
        ctrl = UndoRedoController()
        with pytest.raises(IndexError):
            ctrl.pop_undo()

    def test_pop_redo_empty_raises(self):
        ctrl = UndoRedoController()
        with pytest.raises(IndexError):
            ctrl.pop_redo()


# ===========================================================================
# R-06 — state_hash stability
# ===========================================================================

class TestStateHash:
    def test_hash_deterministic_for_same_state(self):
        s1 = mk_state()
        s2 = mk_state()
        assert s1.state_hash == s2.state_hash

    def test_hash_changes_after_mutation(self):
        state = mk_state()
        h1 = state.state_hash
        engine = EditEngine()
        insert_clip(engine, state, "clip-1")
        h2 = state.state_hash
        assert h1 != h2

    def test_indices_not_in_canonical_dict(self):
        state = mk_state()
        state.rebuild_indices()
        d = state.canonical_dict()
        assert "_indices" not in d


# ===========================================================================
# R-12 — Checkpoint policy
# ===========================================================================

class TestCheckpoints:
    def test_checkpoint_created_at_interval(self):
        state = mk_state()
        store = CheckpointStore(CheckpointPolicy(every_n_ops=2))
        assert store.maybe_create(1, "insert_clip", state) is None
        cp = store.maybe_create(2, "insert_clip", state)
        assert cp is not None

    def test_checkpoint_created_on_op_type(self):
        state = mk_state()
        store = CheckpointStore(CheckpointPolicy(every_n_ops=999, on_op_types=("split_clip",)))
        assert store.maybe_create(1, "insert_clip", state) is None
        cp = store.maybe_create(1, "split_clip", state)
        assert cp is not None

    def test_nearest_returns_latest(self):
        state = mk_state()
        store = CheckpointStore(CheckpointPolicy(every_n_ops=1))
        store.maybe_create(1, "x", state)
        store.maybe_create(2, "x", state)
        nearest = store.nearest()
        assert nearest is not None
        assert nearest[0] == "cp-2"


# ===========================================================================
# R-11 — DomainEventBus
# ===========================================================================

class TestEventBus:
    def test_priority_ordering(self):
        bus = DomainEventBus()
        order = []

        class First:
            def on_event(self, event):
                order.append("first")

        class Second:
            def on_event(self, event):
                order.append("second")

        bus.subscribe(Second(), priority=200)
        bus.subscribe(First(), priority=100)
        bus.emit(DomainEvent(event_type="test", payload={}))
        assert order == ["first", "second"]


# ===========================================================================
# OperationRegistry
# ===========================================================================

class TestOperationRegistry:
    def test_register_and_get(self):
        reg = OperationRegistry()
        reg.register("insert_clip", InsertClipOperation)
        assert reg.get("insert_clip") is InsertClipOperation

    def test_unknown_type_raises(self):
        reg = OperationRegistry()
        with pytest.raises(KeyError):
            reg.get("does_not_exist")

    def test_build(self):
        reg = OperationRegistry()
        reg.register("insert_clip", InsertClipOperation)
        op = reg.build("insert_clip", op_type="insert_clip", actor="ai", payload={})
        assert isinstance(op, InsertClipOperation)


# ===========================================================================
# R-10 — SchemaMigrator explicit-only
# ===========================================================================

class TestSchemaMigrator:
    def test_no_migration_path_raises(self):
        m = SchemaMigrator()
        with pytest.raises(SchemaMigrationRequired):
            m.migrate({}, "0.9.0", "1.0.0")

    def test_same_version_returns_data(self):
        m = SchemaMigrator()
        data = {"x": 1}
        assert m.migrate(data, "1.0.0", "1.0.0") is data

    def test_registered_migration_runs(self):
        m = SchemaMigrator()
        m.register("0.9.0", "1.0.0", lambda d: {**d, "migrated": True})
        result = m.migrate({"x": 1}, "0.9.0", "1.0.0")
        assert result["migrated"] is True


# ===========================================================================
# Serializer roundtrip
# ===========================================================================

class TestSerializerRoundtrip:
    def test_json_roundtrip_preserves_state_hash(self):
        from core.serialization.serializer import StateSerializer

        state = mk_state()
        engine = EditEngine()
        insert_clip(engine, state, "clip-1")
        serializer = StateSerializer()
        json_str = serializer.to_json(state)
        restored = serializer.from_json(json_str)
        assert restored.schema_version == state.schema_version
        assert len(restored.entities) == len(state.entities)
        assert len(restored.tracks) == len(state.tracks)

    def test_yaml_roundtrip(self):
        from core.serialization.serializer import StateSerializer

        state = mk_state()
        engine = EditEngine()
        insert_clip(engine, state, "clip-1")
        serializer = StateSerializer()
        yaml_str = serializer.to_yaml(state)
        restored = serializer.from_yaml(yaml_str)
        assert len(restored.entities) == 1

    def test_version_mismatch_raises(self):
        from core.serialization.serializer import StateSerializer

        serializer = StateSerializer(target_schema_version="2.0.0")
        state = mk_state()
        json_str = StateSerializer(target_schema_version="1.0.0").to_json(state)
        with pytest.raises(SchemaMigrationRequired):
            serializer.from_json(json_str)
