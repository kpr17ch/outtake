from __future__ import annotations

from core.domain.state import EditGraphState
from core.ops.base import BaseOperation, StateDelta


class OperationApplier:
    def apply(self, operation: BaseOperation, state: EditGraphState) -> StateDelta:
        return operation.apply(state)
