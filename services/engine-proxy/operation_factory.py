from __future__ import annotations

from typing import Any
from uuid import uuid4

from core.ops.mcp_tool_op import McpToolOperation
from tool_registry import ToolRegistryEntry


class OperationFactory:
    def build(
        self,
        registry_entry: ToolRegistryEntry,
        tool_input: dict[str, Any],
        tool_result: dict[str, Any],
    ) -> McpToolOperation:
        file_versions_before = dict(tool_input.get("active_file_refs_before", {}))
        state_changes: dict[str, Any] = {}
        output_file = tool_result.get("output_file")
        origin_ref_id = tool_input.get("origin_ref_id")
        output_ref_id = tool_result.get("output_ref_id")
        if output_file and origin_ref_id and output_ref_id:
            state_changes["active_file_refs"] = {origin_ref_id: output_ref_id}
            state_changes["register_versions"] = [
                {
                    "origin_ref_id": origin_ref_id,
                    "ref_id": output_ref_id,
                    "file_path": output_file,
                }
            ]
        return McpToolOperation(
            op_type=registry_entry.op_type,
            actor=registry_entry.server_name,
            payload=dict(tool_input),
            tool_schema_hash=registry_entry.schema_hash,
            result_snapshot=dict(tool_result),
            file_versions_before=file_versions_before,
            state_changes=state_changes,
            correlation_id=str(uuid4()),
        )
