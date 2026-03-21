# engine-proxy

Central MCP mutation proxy for Outtake.

## Responsibilities

- Discover upstream MCP tools dynamically (`list_tools`)
- Expose proxied tools as `server_name/tool_name`
- Forward tool calls to upstream server
- Build `McpToolOperation` from tool input/output
- Apply operation via `EditEngine` for tracking + undo/redo
- Persist project state/history via `ProjectStore` (SQLite)
- Persist generated files into CAS via `ContentStore`

## Files

- `server.py`: stdio entrypoint, project load/create, and engine helper methods (`engine/undo`, `engine/redo`, `engine/get_history`, `engine/get_state`, `engine/save`, `engine/load`, `engine/get_file_versions`)
- `proxy.py`: discover + wrap + forward orchestration, active-file-resolution (`origin_ref_id` -> active `input_file`), schema-based upstream argument filtering, plus CAS/file-version persistence wiring
- `tool_registry.py`: dynamic tool registry with schema hash tracking
- `operation_factory.py`: converts tool call into `McpToolOperation` with dynamic `state_changes` (`active_file_refs`, `register_versions`)
- `http_mcp_client.py`: HTTP JSON-RPC MCP client with session lifecycle (`initialize`, `notifications/initialized`), SSE-aware response decoding, and structured tool result extraction
- `file_naming.py`: immutable versioned output naming helper

## Runtime Persistence Flow

1. `server.py` loads (or creates) a project directory with:
   - `project.outtake` (SQLite DB)
   - `.cas/` (content-addressable file store)
2. `tools/call` hits `EngineProxy.call_tool()`
3. Proxy resolves active file path when only `origin_ref_id` is supplied
4. Upstream tool is called with schema-valid arguments only
5. Result is converted to `McpToolOperation` and applied through `EditEngine`
5. If an output file exists:
   - file is hashed and copied into `.cas/`
   - file version metadata is written to `file_versions` in SQLite

## Active File Guarantee

Before calling upstream FFmpeg tools, `proxy.py` resolves:

- `origin_ref_id` -> `state.file_versions.get_active_version(origin_ref_id).file_path`

This path is injected as `input_file` when missing.  
The effect: tool calls operate on the currently active version, not stale files.

## Undo/Redo Behavior for MCP Tool Mutations

`OperationFactory` writes version actions into operation `state_changes`.
`McpToolOperation.apply()` performs:

- version registration for generated outputs (`register_versions`)
- active pointer updates (`active_file_refs`)

Because these mutations happen inside engine-applied operations, snapshot-based undo/redo restores file-version pointers reliably.
