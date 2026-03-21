from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from core.domain.state import EditGraphState
from core.ops.base import BaseOperation, PreApplyContext, StateDelta, ValidationResult


@dataclass
class McpToolOperation(BaseOperation):
    tool_schema_hash: str | None = None
    result_snapshot: dict[str, Any] | None = None
    file_versions_before: dict[str, str] | None = None
    state_changes: dict[str, Any] = field(default_factory=dict)

    def validate(self, state: EditGraphState) -> ValidationResult:
        _ = state
        return ValidationResult(ok=True)

    def apply(self, state: EditGraphState) -> StateDelta:
        registrations = self.state_changes.get("register_versions", [])
        for item in registrations:
            state.file_versions.register_version(
                origin_ref_id=item["origin_ref_id"],
                ref_id=item["ref_id"],
                file_path=item["file_path"],
                created_by_op_id=self.op_id,
            )
        updates = self.state_changes.get("active_file_refs", {})
        for origin_ref_id, ref_id in updates.items():
            state.file_versions.set_active_ref(origin_ref_id, ref_id)
        modified = sorted(
            set(list(updates.keys()) + [item["origin_ref_id"] for item in registrations])
        )
        return StateDelta(modified=modified)

    def inverse(self, pre_context: PreApplyContext) -> BaseOperation:
        return McpToolRestoreOperation(
            op_type=f"{self.op_type}/restore",
            actor=self.actor,
            payload={"state_snapshot": pre_context.snapshot.get("state_snapshot", {})},
            causation_id=self.op_id,
            correlation_id=self.correlation_id,
        )


@dataclass
class McpToolRestoreOperation(BaseOperation):
    def validate(self, state: EditGraphState) -> ValidationResult:
        _ = state
        return ValidationResult(ok=True)

    def apply(self, state: EditGraphState) -> StateDelta:
        _ = state
        # Snapshot restore is executed by engine-level undo path.
        return StateDelta()

    def inverse(self, pre_context: PreApplyContext) -> BaseOperation:
        return McpToolOperation(
            op_type=self.op_type.replace("/restore", ""),
            actor=self.actor,
            payload={},
            causation_id=self.op_id,
            correlation_id=self.correlation_id,
        )
