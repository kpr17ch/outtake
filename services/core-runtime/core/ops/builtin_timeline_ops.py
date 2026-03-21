from __future__ import annotations

from dataclasses import asdict
from uuid import uuid4

from core.domain.entities import Clip
from core.domain.state import EditGraphState
from core.domain.time import RationalTime
from core.ops.base import BaseOperation, PreApplyContext, StateDelta, ValidationResult


class InsertClipOperation(BaseOperation):
    def validate(self, state: EditGraphState) -> ValidationResult:
        required = {"track_id", "position", "media_ref_id", "source_in", "source_out"}
        if not required.issubset(self.payload):
            return ValidationResult(False, "missing insert_clip payload fields")
        return ValidationResult(True)

    def apply(self, state: EditGraphState) -> StateDelta:
        clip_id = self.payload.get("clip_id", str(uuid4()))
        source_in = RationalTime(**self.payload["source_in"])
        source_out = RationalTime(**self.payload["source_out"])
        clip = Clip(
            id=clip_id,
            kind="clip",
            schema_version=state.schema_version,
            media_ref_id=self.payload["media_ref_id"],
            source_in=source_in,
            source_out=source_out,
            effects=[],
            enabled=True,
        )
        track_id = self.payload["track_id"]
        position = int(self.payload["position"])
        track = next(t for t in state.tracks if t.id == track_id)
        track.item_ids.insert(position, clip_id)
        state.entities[clip_id] = clip
        state.rebuild_indices()
        return StateDelta(added=[clip_id], affected_tracks=[track_id])

    def inverse(self, pre_context: PreApplyContext) -> BaseOperation:
        return DeleteEntityOperation(
            op_type="delete_entity",
            actor=self.actor,
            payload={"entity_id": pre_context.snapshot["inserted_id"]},
            causation_id=self.op_id,
            correlation_id=self.correlation_id,
        )


class DeleteEntityOperation(BaseOperation):
    def validate(self, state: EditGraphState) -> ValidationResult:
        if "entity_id" not in self.payload:
            return ValidationResult(False, "missing entity_id")
        return ValidationResult(True)

    def apply(self, state: EditGraphState) -> StateDelta:
        entity_id = self.payload["entity_id"]
        if entity_id not in state.entities:
            return StateDelta()
        for track in state.tracks:
            if entity_id in track.item_ids:
                track.item_ids.remove(entity_id)
        del state.entities[entity_id]
        state.rebuild_indices()
        return StateDelta(removed=[entity_id])

    def inverse(self, pre_context: PreApplyContext) -> BaseOperation:
        payload: dict = {"entity": pre_context.snapshot["entity"]}
        if "track_id" in pre_context.snapshot:
            payload["track_id"] = pre_context.snapshot["track_id"]
        if "position" in pre_context.snapshot:
            payload["position"] = pre_context.snapshot["position"]
        return RestoreEntityOperation(
            op_type="restore_entity",
            actor=self.actor,
            payload=payload,
            causation_id=self.op_id,
            correlation_id=self.correlation_id,
        )


class RestoreEntityOperation(BaseOperation):
    def apply(self, state: EditGraphState) -> StateDelta:
        entity_data = self.payload["entity"]
        if entity_data["kind"] != "clip":
            raise ValueError("Only clip restore implemented in v1")
        clip = Clip(
            id=entity_data["id"],
            kind=entity_data["kind"],
            schema_version=entity_data["schema_version"],
            attributes=entity_data["attributes"],
            enabled=entity_data["enabled"],
            media_ref_id=entity_data["media_ref_id"],
            source_in=RationalTime(**entity_data["source_in"]),
            source_out=RationalTime(**entity_data["source_out"]),
            effects=entity_data["effects"],
        )
        state.entities[clip.id] = clip
        track_id = self.payload.get("track_id")
        position = self.payload.get("position")
        if track_id is not None and position is not None:
            track = next(t for t in state.tracks if t.id == track_id)
            track.item_ids.insert(position, clip.id)
        state.rebuild_indices()
        return StateDelta(added=[clip.id])

    def inverse(self, pre_context: PreApplyContext) -> BaseOperation:
        return DeleteEntityOperation(
            op_type="delete_entity",
            actor=self.actor,
            payload={"entity_id": self.payload["entity"]["id"]},
            causation_id=self.op_id,
            correlation_id=self.correlation_id,
        )


class TrimClipOperation(BaseOperation):
    def validate(self, state: EditGraphState) -> ValidationResult:
        req = {"clip_id", "source_in", "source_out"}
        if not req.issubset(self.payload):
            return ValidationResult(False, "missing trim payload")
        return ValidationResult(True)

    def apply(self, state: EditGraphState) -> StateDelta:
        clip = state.entities[self.payload["clip_id"]]
        if not isinstance(clip, Clip):
            raise ValueError("trim_clip can only target clip")
        clip.source_in = RationalTime(**self.payload["source_in"])
        clip.source_out = RationalTime(**self.payload["source_out"])
        return StateDelta(modified=[clip.id])

    def inverse(self, pre_context: PreApplyContext) -> BaseOperation:
        before = pre_context.snapshot["clip_before"]
        return TrimClipOperation(
            op_type="trim_clip",
            actor=self.actor,
            payload={
                "clip_id": before["id"],
                "source_in": before["source_in"],
                "source_out": before["source_out"],
            },
            causation_id=self.op_id,
            correlation_id=self.correlation_id,
        )


def clip_to_snapshot(clip: Clip) -> dict:
    return asdict(clip)
