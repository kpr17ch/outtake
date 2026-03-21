from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass


@dataclass
class ToolRegistryEntry:
    server_name: str
    tool_name: str
    input_schema: dict
    schema_hash: str
    description: str = ""

    @property
    def op_type(self) -> str:
        return f"{self.server_name}/{self.tool_name}"


class ToolRegistry:
    def __init__(self) -> None:
        self._entries: dict[str, ToolRegistryEntry] = {}

    def discover(self, server_name: str, tools: list[dict]) -> None:
        for tool in tools:
            tool_name = tool["name"]
            input_schema = tool.get("inputSchema", {"type": "object", "properties": {}})
            raw = json.dumps(input_schema, sort_keys=True, separators=(",", ":"))
            schema_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()
            entry = ToolRegistryEntry(
                server_name=server_name,
                tool_name=tool_name,
                input_schema=input_schema,
                schema_hash=schema_hash,
                description=tool.get("description", ""),
            )
            self._entries[entry.op_type] = entry

    def get(self, op_type: str) -> ToolRegistryEntry | None:
        return self._entries.get(op_type)

    def all_tools(self) -> list[ToolRegistryEntry]:
        return [self._entries[k] for k in sorted(self._entries.keys())]

    def refresh(self, server_name: str, tools: list[dict]) -> None:
        stale = [key for key, val in self._entries.items() if val.server_name == server_name]
        for key in stale:
            del self._entries[key]
        self.discover(server_name, tools)
