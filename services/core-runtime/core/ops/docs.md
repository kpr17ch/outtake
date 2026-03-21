# core/ops/ — Operation Framework

This package defines how mutations happen. Every change to `EditGraphState` is represented as a typed `BaseOperation` that goes through validation, application, and inverse construction. No direct state manipulation is allowed outside this framework.

## Role in the System

The operations package sits between the `EditEngine` (which orchestrates) and the `domain` (which holds state). The engine calls into `ops` components in this order:

```
EditEngine.apply()
  ├── OperationValidator.validate(op, state)
  ├── OperationApplier.apply(op, state)
  └── op.inverse(pre_context) → via InverseBuilder
```

---

## Files

### `base.py` — Foundation Classes

**`BaseOperation`** — dataclass that every operation type inherits from:

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `op_type` | `str` | required | Type discriminator ("insert_clip", "trim_clip", etc.) |
| `actor` | `str` | required | Who created this operation ("ai", "user", "system") |
| `payload` | `dict` | required | Operation-specific data |
| `op_id` | `str` | auto UUID | Unique operation identifier |
| `ts` | `str` | auto ISO timestamp | When the operation was created |
| `preconditions` | `list[dict]` | `[]` | Optional preconditions for validation |
| `causation_id` | `str \| None` | `None` | ID of the operation that caused this one |
| `correlation_id` | `str \| None` | `None` | ID linking related operations |

Methods (to be overridden by subclasses):
- `validate(state) → ValidationResult` — check if the operation is valid given current state
- `apply(state) → StateDelta` — mutate the state, return what changed
- `inverse(pre_context) → BaseOperation` — build the inverse operation for undo

**`PreApplyContext`** — snapshot captured *before* apply:
- `op_id` — which operation this context belongs to
- `snapshot` — dict of pre-apply state (entity data, track positions, etc.)
- `affected_track_ids` — which tracks are touched

**`StateDelta`** — describes what changed:
- `added` — list of entity IDs that were added
- `modified` — list of entity IDs that were modified
- `removed` — list of entity IDs that were removed
- `affected_tracks` — which tracks were affected

**`ValidationResult`** — `ok: bool` + `reason: str`.

---

### `registry.py` — OperationRegistry

Maps `op_type` strings to their `BaseOperation` subclasses.

- `register(op_type, op_cls)` — register a new operation type
- `get(op_type) → Type[BaseOperation]` — look up by type string, raises `KeyError` if unknown
- `build(op_type, /, **kwargs) → BaseOperation` — convenience: look up + instantiate. The `op_type` parameter is positional-only (`/`) so callers can also pass `op_type` in `**kwargs` without conflict.

Used by the plugin system to register external operation types.

---

### `validator.py` — OperationValidator

Two-stage validation:

1. **Operation-level**: calls `operation.validate(state)` — the operation checks its own payload
2. **Invariant-level**: `_validate_invariants()` applies cross-cutting domain rules:
   - `insert_clip`: validates `source_in`/`source_out` against `AssetRegistry.resolve_range()`
   - `trim_clip`: verifies the target clip exists and is a `Clip` instance

Returns `ValidationResult(ok=False, reason=...)` on any failure.

---

### `applier.py` — OperationApplier

A thin wrapper that calls `operation.apply(state)`. Exists as a separate class to keep the engine's apply pipeline explicit and to allow future interception (logging, metrics, sandboxing).

---

### `builtin_timeline_ops.py` — Built-in V1 Operations

Four concrete operations shipped with V1:

#### `InsertClipOperation` (op_type: `"insert_clip"`)

**Required payload fields:** `track_id`, `position`, `media_ref_id`, `source_in`, `source_out`
**Optional:** `clip_id` (auto-generated UUID if absent)

**validate:** checks all required fields are present.
**apply:** creates a `Clip` entity, inserts its ID into `track.item_ids` at `position`, rebuilds indices.
**inverse:** returns `DeleteEntityOperation` targeting the inserted clip.

#### `DeleteEntityOperation` (op_type: `"delete_entity"`)

**Required payload:** `entity_id`

**apply:** removes entity from `state.entities` and from all `track.item_ids`. No-op if entity doesn't exist.
**inverse:** returns `RestoreEntityOperation` with the full entity snapshot + `track_id` + `position` from `PreApplyContext`.

#### `RestoreEntityOperation` (op_type: `"restore_entity"`)

**Payload:** `entity` (full entity dict), optional `track_id` + `position`

**apply:** reconstructs the entity from payload, adds it back to `state.entities`, and re-inserts into the track at the original position. V1 only supports clip restore.
**inverse:** returns `DeleteEntityOperation`.

#### `TrimClipOperation` (op_type: `"trim_clip"`)

**Required payload:** `clip_id`, `source_in`, `source_out`

**apply:** updates `source_in` and `source_out` on the target clip.
**inverse:** returns `TrimClipOperation` with the *old* values from `PreApplyContext.snapshot["clip_before"]`.

#### `clip_to_snapshot(clip) → dict`

Utility function that converts a `Clip` to a dict via `dataclasses.asdict()`.

---

### `__init__.py`

Exports `OperationRegistry`.
