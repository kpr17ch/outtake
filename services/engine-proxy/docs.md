# engine-proxy

Central MCP mutation proxy for Outtake.

## Responsibilities

- Discover upstream MCP tools dynamically (`list_tools`)
- Expose proxied tools as `server_name/tool_name`
- Forward tool calls to upstream server
- Build `McpToolOperation` from tool input/output
- Apply operation via `EditEngine` for tracking + undo/redo

## Files

- `server.py`: stdio entrypoint and engine helper methods (`engine/undo`, `engine/redo`, `engine/get_history`, `engine/get_state`)
- `proxy.py`: discover + wrap + forward orchestration
- `tool_registry.py`: dynamic tool registry with schema hash tracking
- `operation_factory.py`: converts tool call into `McpToolOperation`
- `file_naming.py`: immutable versioned output naming helper
