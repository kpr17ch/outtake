# services/ — Runtime Services Overview

This directory contains the runtime services that together power Outtake's AI-first editing backend.

## Services

### `core-runtime/`

Deterministic domain core with:
- `EditGraphState` as single source of truth
- typed operation pipeline
- snapshot-based undo/redo
- schema-validated serialization
- persistence adapters (`core/storage/`) for SQLite + CAS

Entry documentation:
- `core-runtime/README.md`
- `core-runtime/docs.md`

### `engine-proxy/`

MCP-facing service that:
- discovers upstream MCP tools dynamically
- forwards tool calls to upstream servers
- wraps tool calls as `McpToolOperation`
- applies operations through `EditEngine`
- persists state/history/file-versions through `ProjectStore`

Entry documentation:
- `engine-proxy/docs.md`

## Data Responsibility Split

- `core-runtime` owns **state model + mutation rules + history semantics**
- `engine-proxy` owns **tool orchestration + external integration**

This split keeps the core deterministic and testable while allowing dynamic MCP tool integration.
