from __future__ import annotations

from dataclasses import asdict

from core.domain.entities import Clip
from core.domain.state import EditGraphState
from core.history.checkpoints import CheckpointStore
from core.history.inverse_builder import InverseBuilder
from core.history.log import OperationLog
from core.history.undo_redo import UndoRedoController
from core.ops.base import BaseOperation, PreApplyContext
from core.ops.applier import OperationApplier
from core.ops.validator import OperationValidator
from core.serialization.serializer import StateSerializer
from events.bus import DomainEvent, DomainEventBus


class EditEngine:
    def __init__(self) -> None:
        self.validator = OperationValidator()
        self.applier = OperationApplier()
        self.inverse_builder = InverseBuilder()
        self.log = OperationLog()
        self.undo_redo = UndoRedoController()
        self.checkpoints = CheckpointStore()
        self.events = DomainEventBus()
        self._applied_count = 0

    def _capture_pre_context(
        self, operation: BaseOperation, state: EditGraphState
    ) -> PreApplyContext:
        snapshot = {"state_snapshot": state.canonical_dict()}
        if operation.op_type == "insert_clip":
            snapshot["inserted_id"] = operation.payload.get("clip_id")
        elif operation.op_type == "trim_clip":
            clip_id = operation.payload["clip_id"]
            clip = state.entities.get(clip_id)
            if isinstance(clip, Clip):
                snapshot["clip_before"] = asdict(clip)
        elif operation.op_type == "delete_entity":
            entity_id = operation.payload["entity_id"]
            entity = state.entities.get(entity_id)
            if entity is not None:
                snapshot["entity"] = asdict(entity)
                for track in state.tracks:
                    if entity_id in track.item_ids:
                        snapshot["track_id"] = track.id
                        snapshot["position"] = track.item_ids.index(entity_id)
                        break
        affected_tracks = []
        if "track_id" in operation.payload:
            affected_tracks.append(operation.payload["track_id"])
        return PreApplyContext(op_id=operation.op_id, snapshot=snapshot, affected_track_ids=affected_tracks)

    def apply(self, operation: BaseOperation, state: EditGraphState) -> None:
        state_snapshot_before = state.canonical_dict()
        validation = self.validator.validate(operation, state)
        if not validation.ok:
            self.events.emit(
                DomainEvent(
                    event_type="OperationRejected",
                    payload={"op_id": operation.op_id, "reason": validation.reason},
                )
            )
            raise ValueError(validation.reason)
        pre_context = self._capture_pre_context(operation, state)
        delta = self.applier.apply(operation, state)
        inverse = self.inverse_builder.build(operation, pre_context, delta)
        self.log.append(operation)
        self.undo_redo.record(
            operation.op_id,
            inverse,
            state_snapshot=state_snapshot_before,
            redo_snapshot=state.canonical_dict(),
        )
        self._applied_count += 1
        checkpoint_id = self.checkpoints.maybe_create(
            self._applied_count, operation.op_type, state
        )
        self.events.emit(
            DomainEvent(
                event_type="StateChanged",
                payload={"op_id": operation.op_id, "delta": delta.__dict__},
            )
        )
        if checkpoint_id:
            self.events.emit(
                DomainEvent(
                    event_type="CheckpointCreated",
                    payload={"checkpoint_id": checkpoint_id},
                )
            )

    def undo(self, state: EditGraphState) -> None:
        entry = self.undo_redo.pop_undo()
        self._restore_state_from_snapshot(state, entry.state_snapshot)
        self.events.emit(
            DomainEvent(event_type="UndoPerformed", payload={"op_id": entry.op_id})
        )

    def redo(self, state: EditGraphState) -> None:
        entry = self.undo_redo.pop_redo()
        self._restore_state_from_snapshot(state, entry.redo_snapshot)
        self.events.emit(
            DomainEvent(event_type="RedoPerformed", payload={"op_id": entry.op_id})
        )

    def _restore_state_from_snapshot(self, state: EditGraphState, snapshot: dict) -> None:
        serializer = StateSerializer(target_schema_version=snapshot["schema_version"])
        restored = serializer.from_mapping(snapshot)
        state.project_meta = restored.project_meta
        state.tracks = restored.tracks
        state.entities = restored.entities
        state.asset_registry = restored.asset_registry
        state.file_versions = restored.file_versions
        state.schema_version = restored.schema_version
        state.rebuild_indices()
