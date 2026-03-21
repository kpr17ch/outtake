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
- `proxy.py`: discover + wrap + forward orchestration, plus CAS/file-version persistence wiring
- `tool_registry.py`: dynamic tool registry with schema hash tracking
- `operation_factory.py`: converts tool call into `McpToolOperation`
- `file_naming.py`: immutable versioned output naming helper

## Runtime Persistence Flow

1. `server.py` loads (or creates) a project directory with:
   - `project.outtake` (SQLite DB)
   - `.cas/` (content-addressable file store)
2. `tools/call` hits `EngineProxy.call_tool()`
3. Upstream tool is called
4. Result is converted to `McpToolOperation` and applied through `EditEngine`
5. If an output file exists:
   - file is hashed and copied into `.cas/`
   - file version metadata is written to `file_versions` in SQLite
