from __future__ import annotations

from core.domain.entities import Clip
from core.domain.state import EditGraphState
from core.ops.mcp_tool_op import McpToolOperation
from core.ops.base import BaseOperation, ValidationResult


class OperationValidator:
    def validate(self, operation: BaseOperation, state: EditGraphState) -> ValidationResult:
        result = operation.validate(state)
        if not result.ok:
            return result
        return self._validate_invariants(operation, state)

    def _validate_invariants(
        self, operation: BaseOperation, state: EditGraphState
    ) -> ValidationResult:
        if isinstance(operation, McpToolOperation):
            return ValidationResult(ok=True)
        if operation.op_type == "insert_clip":
            media_ref_id = operation.payload["media_ref_id"]
            source_in = operation.payload["source_in"]
            source_out = operation.payload["source_out"]
            available = state.asset_registry.resolve_range(media_ref_id)
            if source_in["rate"] != source_out["rate"]:
                return ValidationResult(ok=False, reason="source rate mismatch")
            if source_out["value"] < source_in["value"]:
                return ValidationResult(ok=False, reason="source_out before source_in")
            if source_in["value"] < available.start.value:
                return ValidationResult(ok=False, reason="source_in before available range")
            if source_out["value"] > available.end_exclusive.value:
                return ValidationResult(ok=False, reason="source_out after available range")
        if operation.op_type == "trim_clip":
            clip_id = operation.payload["clip_id"]
            clip = state.entities.get(clip_id)
            if not isinstance(clip, Clip):
                return ValidationResult(ok=False, reason="clip does not exist")
        return ValidationResult(ok=True)
