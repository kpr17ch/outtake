from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from core.domain.state import EditGraphState


@dataclass(frozen=True)
class CheckpointPolicy:
    every_n_ops: int = 50
    on_op_types: tuple[str, ...] = ()


class CheckpointStore:
    def __init__(self, policy: CheckpointPolicy | None = None) -> None:
        self.policy = policy or CheckpointPolicy()
        self._points: dict[str, dict[str, Any]] = {}

    def maybe_create(self, op_index: int, op_type: str, state: EditGraphState) -> str | None:
        by_interval = op_index > 0 and op_index % self.policy.every_n_ops == 0
        by_kind = op_type in self.policy.on_op_types
        if not (by_interval or by_kind):
            return None
        checkpoint_id = f"cp-{op_index}"
        self._points[checkpoint_id] = state.canonical_dict()
        return checkpoint_id

    def nearest(self) -> tuple[str, dict[str, Any]] | None:
        if not self._points:
            return None
        key = sorted(self._points.keys())[-1]
        return key, self._points[key]
