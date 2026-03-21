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
