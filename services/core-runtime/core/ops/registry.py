from __future__ import annotations

from typing import Type

from .base import BaseOperation


class OperationRegistry:
    def __init__(self) -> None:
        self._mapping: dict[str, Type[BaseOperation]] = {}

    def register(self, op_type: str, op_cls: Type[BaseOperation]) -> None:
        self._mapping[op_type] = op_cls

    def get(self, op_type: str) -> Type[BaseOperation]:
        if op_type not in self._mapping:
            raise KeyError(f"Unknown operation type: {op_type}")
        return self._mapping[op_type]

    def build(self, op_type: str, /, **kwargs) -> BaseOperation:
        kwargs["op_type"] = op_type
        return self.get(op_type)(**kwargs)
