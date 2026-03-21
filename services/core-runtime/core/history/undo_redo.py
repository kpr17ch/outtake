from __future__ import annotations

from collections import deque
from dataclasses import dataclass

from core.ops.base import BaseOperation


@dataclass
class UndoEntry:
    op_id: str
    inverse_op: BaseOperation
    state_snapshot: dict
    redo_snapshot: dict


class UndoRedoController:
    def __init__(self) -> None:
        self._done: deque[UndoEntry] = deque()
        self._undone: deque[UndoEntry] = deque()

    def record(
        self,
        op_id: str,
        inverse_op: BaseOperation,
        state_snapshot: dict | None = None,
        redo_snapshot: dict | None = None,
    ) -> None:
        self._done.append(
            UndoEntry(
                op_id=op_id,
                inverse_op=inverse_op,
                state_snapshot=state_snapshot or {},
                redo_snapshot=redo_snapshot or {},
            )
        )
        self._undone.clear()

    def pop_undo(self) -> UndoEntry:
        if not self._done:
            raise IndexError("nothing to undo")
        entry = self._done.pop()
        self._undone.append(entry)
        return entry

    def pop_redo(self) -> UndoEntry:
        if not self._undone:
            raise IndexError("nothing to redo")
        entry = self._undone.pop()
        self._done.append(entry)
        return entry

    def can_undo(self) -> bool:
        return bool(self._done)

    def can_redo(self) -> bool:
        return bool(self._undone)

    def to_persistable(self) -> tuple[list[dict], list[dict]]:
        done = [self._entry_to_dict(item) for item in self._done]
        undone = [self._entry_to_dict(item) for item in self._undone]
        return done, undone

    @classmethod
    def from_persistable(
        cls, done: list[dict] | None, undone: list[dict] | None
    ) -> "UndoRedoController":
        controller = cls()
        for item in done or []:
            controller._done.append(cls._entry_from_dict(item))
        for item in undone or []:
            controller._undone.append(cls._entry_from_dict(item))
        return controller

    @staticmethod
    def _entry_to_dict(item: UndoEntry) -> dict:
        return {
            "op_id": item.op_id,
            "inverse_op": {
                "op_type": item.inverse_op.op_type,
                "actor": item.inverse_op.actor,
                "payload": item.inverse_op.payload,
                "op_id": item.inverse_op.op_id,
                "ts": item.inverse_op.ts,
                "preconditions": item.inverse_op.preconditions,
                "causation_id": item.inverse_op.causation_id,
                "correlation_id": item.inverse_op.correlation_id,
            },
            "state_snapshot": item.state_snapshot,
            "redo_snapshot": item.redo_snapshot,
        }

    @staticmethod
    def _entry_from_dict(payload: dict) -> UndoEntry:
        inverse = BaseOperation(**payload["inverse_op"])
        return UndoEntry(
            op_id=payload["op_id"],
            inverse_op=inverse,
            state_snapshot=payload.get("state_snapshot", {}),
            redo_snapshot=payload.get("redo_snapshot", {}),
        )
