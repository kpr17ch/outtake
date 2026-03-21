# core/storage/ — Persistence Adapters

This package adds durable persistence for the runtime without changing the domain model.

## Why It Exists

The `core.domain` and `core.history` modules are intentionally in-memory and deterministic.
`core/storage` bridges runtime objects to disk:

- SQLite for project state/history metadata
- content-addressable file storage (CAS) for produced media files

## Files

### `project_store.py` — `ProjectStore`

SQLite-backed persistence adapter with WAL mode enabled.

Main responsibilities:
- persist forward operation log entries
- persist full current project state
- persist undo/redo stacks
- persist checkpoints
- persist file-version metadata (including CAS hash)

Tables:
- `operations`
- `snapshots`
- `undo_stack`
- `file_versions`
- `project_state`

Important methods:
- `save_operation(entry)`
- `save_state(state)`
- `save_undo_stack(done, undone)`
- `save_snapshot(checkpoint_id, state_dict)`
- `load_state()`
- `load_operations()`
- `load_undo_stack()`
- `register_file(...)`
- `list_file_versions(...)`

### `cas.py` — `ContentStore`

Simple content-addressable store for media outputs.

Behavior:
- computes SHA-256 over file bytes
- stores file under `.cas/<2>/<2>/<fullhash><suffix>`
- deduplicates by hash automatically (does not copy if already present)

Important methods:
- `put(src_path) -> hash`
- `get_path(hash, suffix)`
- `exists(hash, suffix)`

### `__init__.py`

Package exports:
- `ProjectStore`
- `ContentStore`

## Scope Notes

- No garbage collection yet (old CAS files are retained)
- No chunked dedup yet (whole-file hash only)
- No schema migration layer for SQLite tables yet (v1 bootstrap)
