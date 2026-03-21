from __future__ import annotations

from core.ops.base import BaseOperation, PreApplyContext, StateDelta


class InverseBuilder:
    def build(
        self, operation: BaseOperation, pre_context: PreApplyContext, _delta: StateDelta
    ) -> BaseOperation:
        return operation.inverse(pre_context)
