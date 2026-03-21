from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from core.ops.base import BaseOperation


@dataclass
class OperationLogEntry:
    op_id: str
    op_type: str
    ts: str
    actor: str
    causation_id: str | None
    correlation_id: str | None
    payload: dict[str, Any]
    tool_schema_hash: str | None = None
    result_snapshot: dict[str, Any] | None = None
    file_versions_before: dict[str, str] | None = None


class OperationLog:
    def __init__(self) -> None:
        self._entries: list[OperationLogEntry] = []

    def append(self, operation: BaseOperation) -> None:
        self._entries.append(
            OperationLogEntry(
                op_id=operation.op_id,
                op_type=operation.op_type,
                ts=operation.ts,
                actor=operation.actor,
                causation_id=operation.causation_id,
                correlation_id=operation.correlation_id,
                payload=operation.payload,
                tool_schema_hash=getattr(operation, "tool_schema_hash", None),
                result_snapshot=getattr(operation, "result_snapshot", None),
                file_versions_before=getattr(operation, "file_versions_before", None),
            )
        )

    def entries(self) -> list[OperationLogEntry]:
        return list(self._entries)
