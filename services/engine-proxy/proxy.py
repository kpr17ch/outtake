from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from core.engine import EditEngine
from core.ops.mcp_tool_op import McpToolOperation
from operation_factory import OperationFactory
from tool_registry import ToolRegistry


class UpstreamMcpClient(Protocol):
    def list_tools(self) -> list[dict]:
        ...

    def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        ...


@dataclass
class ProxyResponse:
    result: dict[str, Any]
    operation: McpToolOperation


class EngineProxy:
    def __init__(self, engine: EditEngine, state, clients: dict[str, UpstreamMcpClient]) -> None:
        self.engine = engine
        self.state = state
        self.clients = clients
        self.registry = ToolRegistry()
        self.operation_factory = OperationFactory()

    def discover_tools(self) -> list[dict]:
        for server_name, client in self.clients.items():
            self.registry.refresh(server_name, client.list_tools())
        return [
            {
                "name": entry.op_type,
                "description": entry.description,
                "inputSchema": entry.input_schema,
            }
            for entry in self.registry.all_tools()
        ]

    def call_tool(self, op_type: str, arguments: dict[str, Any]) -> ProxyResponse:
        entry = self.registry.get(op_type)
        if entry is None:
            raise KeyError(f"Unknown proxied tool: {op_type}")
        upstream = self.clients[entry.server_name]
        result = upstream.call_tool(entry.tool_name, arguments)
        operation = self.operation_factory.build(entry, arguments, result)
        self.engine.apply(operation, self.state)
        output_file = result.get("output_file")
        origin_ref_id = arguments.get("origin_ref_id")
        output_ref_id = result.get("output_ref_id")
        if output_file and origin_ref_id and output_ref_id:
            self.state.file_versions.register_version(
                origin_ref_id=origin_ref_id,
                ref_id=output_ref_id,
                file_path=output_file,
                created_by_op_id=operation.op_id,
            )
        return ProxyResponse(result=result, operation=operation)
