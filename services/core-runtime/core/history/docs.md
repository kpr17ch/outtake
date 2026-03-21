# core/history/ — Undo/Redo, Logging, Checkpoints

This package manages everything related to edit history: the append-only operation log, the undo/redo stacks with full state snapshots, and periodic state checkpoints.

## Role in the System

After the `EditEngine` applies an operation, it hands the result to the history subsystem:

```
EditEngine.apply()
  ├── ... (validate, pre-context, apply) ...
  ├── OperationLog.append(op)                               → audit trail
  ├── UndoRedoController.record(op_id, inverse, snapshots)  → undo stack
  └── CheckpointStore.maybe_create(count, type, state)      → periodic snapshot
```

For undo (snapshot-based):
```
EditEngine.undo()
  ├── UndoRedoController.pop_undo() → entry with state_snapshot
  └── _restore_state_from_snapshot(state, entry.state_snapshot)
```

For redo:
```
EditEngine.redo()
  ├── UndoRedoController.pop_redo() → entry with redo_snapshot
  └── _restore_state_from_snapshot(state, entry.redo_snapshot)
```

---

## Files

### `log.py` — OperationLog (Append-Only Audit Trail)

**`OperationLogEntry`** — immutable record of a single operation:

| Field | Type | Purpose |
|-------|------|---------|
| `op_id` | `str` | Unique operation ID |
| `op_type` | `str` | Operation type ("insert_clip", "ffmpeg/cut_clip", etc.) |
| `ts` | `str` | ISO timestamp |
| `actor` | `str` | Who initiated ("ai", "user", "ffmpeg") |
| `causation_id` | `str \| None` | Which operation caused this one |
| `correlation_id` | `str \| None` | Links related operations |
| `payload` | `dict` | Full operation payload |
| `tool_schema_hash` | `str \| None` | SHA-256 of MCP tool input schema (dynamic ops only) |
| `result_snapshot` | `dict \| None` | Tool result snapshot (dynamic ops only) |
| `file_versions_before` | `dict \| None` | Active file refs before operation (dynamic ops only) |

**`OperationLog`**:
- `append(operation)` — creates an entry from a `BaseOperation` and appends it
- `entries()` — returns a **copy** of the internal list (immutability guarantee)

The log stores **forward operations only**. Inverse operations (used for undo) are never logged.

---

### `undo_redo.py` — UndoRedoController

Manages two stacks: `_done` (undo-able) and `_undone` (redo-able).

**`UndoEntry`** — pairs an `op_id` with its `inverse_op`, plus full `state_snapshot` and `redo_snapshot` dicts.

**`UndoRedoController`**:
- `record(op_id, inverse_op, state_snapshot, redo_snapshot)` — pushes to `_done`, **clears `_undone`**
- `pop_undo()` → moves top of `_done` to `_undone`, returns the entry
- `pop_redo()` → moves top of `_undone` to `_done`, returns the entry
- `can_undo()` / `can_redo()` → bool checks

Undo/redo works by restoring the full `EditGraphState` from the stored snapshot, making it robust for any operation type — including dynamically generated MCP tool operations.

---

### `checkpoints.py` — CheckpointStore

Periodic full-state snapshots for faster replay recovery.

**`CheckpointPolicy(frozen=True)`**:
- `every_n_ops: int = 50` — create checkpoint every N operations
- `on_op_types: tuple[str, ...] = ()` — create checkpoint on specific operation types

**`CheckpointStore`**:
- `maybe_create(op_index, op_type, state) → str | None` — creates a checkpoint if policy triggers
- `nearest() → tuple[str, dict] | None` — returns the most recent checkpoint

Checkpoints store `state.canonical_dict()`.

---

### `__init__.py`

Exports module names: `log`, `undo_redo`, `checkpoints`.
