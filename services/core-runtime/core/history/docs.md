# core/history/ — Undo/Redo, Logging, Checkpoints

This package manages everything related to edit history: the append-only operation log, the undo/redo stacks, the inverse operation builder, and periodic state checkpoints.

## Role in the System

After the `EditEngine` applies an operation, it hands the result to the history subsystem:

```
EditEngine.apply()
  ├── ... (validate, pre-context, apply) ...
  ├── InverseBuilder.build(op, pre_context, delta) → inverse_op
  ├── OperationLog.append(op)                      → audit trail
  ├── UndoRedoController.record(op_id, inverse_op) → undo stack
  └── CheckpointStore.maybe_create(count, type, state) → periodic snapshot
```

For undo:
```
EditEngine.undo()
  ├── UndoRedoController.pop_undo() → inverse_op
  └── OperationApplier.apply(inverse_op, state)
```

---

## Files

### `log.py` — OperationLog (Append-Only Audit Trail)

**`OperationLogEntry`** — immutable record of a single operation:

| Field | Type | Purpose |
|-------|------|---------|
| `op_id` | `str` | Unique operation ID |
| `op_type` | `str` | Operation type ("insert_clip", etc.) |
| `ts` | `str` | ISO timestamp |
| `actor` | `str` | Who initiated ("ai", "user") |
| `causation_id` | `str \| None` | Which operation caused this one |
| `correlation_id` | `str \| None` | Links related operations |
| `payload` | `dict` | Full operation payload |

**`OperationLog`**:
- `append(operation)` — creates an entry from a `BaseOperation` and appends it
- `entries()` — returns a **copy** of the internal list (immutability guarantee)

The log stores **forward operations only**. Inverse operations (used for undo) are never logged. This keeps the log clean for audit, replay, and debugging.

---

### `undo_redo.py` — UndoRedoController

Manages two stacks: `_done` (undo-able) and `_undone` (redo-able).

**`UndoEntry`** — pairs an `op_id` with its `inverse_op`.

**`UndoRedoController`**:
- `record(op_id, inverse_op)` — pushes to `_done`, **clears `_undone`** (any redo history is lost when a new operation is applied — standard undo/redo behavior)
- `pop_undo()` → moves top of `_done` to `_undone`, returns the entry. Raises `IndexError` if empty.
- `pop_redo()` → moves top of `_undone` to `_done`, returns the entry. Raises `IndexError` if empty.
- `can_undo()` / `can_redo()` → bool checks

**Stack behavior example:**
```
apply(insert)  → done=[insert_inv]    undone=[]
apply(trim)    → done=[insert_inv, trim_inv]  undone=[]
undo()         → done=[insert_inv]    undone=[trim_inv]
undo()         → done=[]              undone=[trim_inv, insert_inv]
redo()         → done=[insert_inv]    undone=[trim_inv]
apply(delete)  → done=[insert_inv, delete_inv]  undone=[]  ← redo cleared!
```

---

### `inverse_builder.py` — InverseBuilder

Thin orchestration class:
- `build(operation, pre_context, delta) → BaseOperation`
- Delegates to `operation.inverse(pre_context)`

Exists as a separate class to allow future interception (logging, validation of inverse operations, etc.).

---

### `checkpoints.py` — CheckpointStore

Periodic full-state snapshots for faster replay recovery.

**`CheckpointPolicy(frozen=True)`**:
- `every_n_ops: int = 50` — create checkpoint every N operations
- `on_op_types: tuple[str, ...] = ()` — create checkpoint on specific operation types

**`CheckpointStore`**:
- `maybe_create(op_index, op_type, state) → str | None` — creates a checkpoint if policy triggers. Returns checkpoint ID or `None`.
- `nearest() → tuple[str, dict] | None` — returns the most recent checkpoint

Checkpoints store `state.canonical_dict()` — the same deterministic representation used for serialization and hashing.

---

### `__init__.py`

Exports module names: `log`, `undo_redo`, `checkpoints`, `inverse_builder`.
