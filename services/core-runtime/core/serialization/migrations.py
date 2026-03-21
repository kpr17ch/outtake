from __future__ import annotations

from typing import Any, Callable


class SchemaMigrationRequired(Exception):
    pass


class SchemaMigrator:
    def __init__(self) -> None:
        self._migrations: dict[tuple[str, str], Callable[[dict[str, Any]], dict[str, Any]]] = {}

    def register(
        self, from_version: str, to_version: str, fn: Callable[[dict[str, Any]], dict[str, Any]]
    ) -> None:
        self._migrations[(from_version, to_version)] = fn

    def migrate(self, data: dict[str, Any], from_version: str, to_version: str) -> dict[str, Any]:
        if from_version == to_version:
            return data
        key = (from_version, to_version)
        if key not in self._migrations:
            raise SchemaMigrationRequired(
                f"no migration from {from_version} to {to_version}"
            )
        return self._migrations[key](data)
