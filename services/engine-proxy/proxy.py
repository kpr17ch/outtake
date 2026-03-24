from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from core.engine import EditEngine
from core.ops.mcp_tool_op import McpToolOperation
from core.storage.cas import ContentStore
from core.storage.project_store import ProjectStore
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
    def __init__(
        self,
        engine: EditEngine,
        state,
        clients: dict[str, UpstreamMcpClient],
        store: ProjectStore | None = None,
        content_store: ContentStore | None = None,
    ) -> None:
        self.engine = engine
        self.state = state
        self.clients = clients
        self.store = store
        self.content_store = content_store
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
        operation_args = dict(arguments)
        if "origin_ref_id" in arguments and "input_file" not in arguments:
            origin_ref_id = arguments["origin_ref_id"]
            try:
                active = self.state.file_versions.get_active_version(origin_ref_id)
            except KeyError as exc:
                raise ValueError(
                    f"No active file for origin_ref_id={origin_ref_id!r}. "
                    "Pass absolute input_file/output_file paths under the workspace, or open a video in the editor so "
                    "'active_video' is registered."
                ) from exc
            operation_args["input_file"] = active.file_path
        schema_props = entry.input_schema.get("properties", {})
        if isinstance(schema_props, dict) and schema_props:
            upstream_args = {
                key: value for key, value in operation_args.items() if key in schema_props
            }
        else:
            upstream_args = dict(operation_args)
        upstream = self.clients[entry.server_name]
        result = upstream.call_tool(entry.tool_name, upstream_args)
        operation = self.operation_factory.build(entry, operation_args, result)
        output_file = result.get("output_file")
        origin_ref_id = operation_args.get("origin_ref_id")
        output_ref_id = result.get("output_ref_id")
        self.engine.apply(operation, self.state)
        if output_file and origin_ref_id and output_ref_id:
            cas_hash: str | None = None
            if self.content_store is not None:
                cas_hash = self.content_store.put(Path(output_file))
            if self.store is not None:
                active_version = self.state.file_versions.get_active_version(origin_ref_id)
                self.store.register_file(
                    ref_id=output_ref_id,
                    origin_ref_id=origin_ref_id,
                    file_path=output_file,
                    cas_hash=cas_hash,
                    version=active_version.version,
                    op_id=operation.op_id,
                )
        return ProxyResponse(result=result, operation=operation)
