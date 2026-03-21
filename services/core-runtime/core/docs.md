# core/ — Engine and Subsystems

This is the main package of Outtake Edit Core. It contains the `EditEngine` orchestrator and all subsystem packages (domain, ops, history, serialization).

## Package Structure

```
core/
├── engine.py              # EditEngine — central orchestrator
├── domain/                # Data model (time, entities, assets, state)
│   └── docs.md
├── ops/                   # Operation framework (base, registry, validator, built-in ops)
│   └── docs.md
├── history/               # Undo/redo, operation log, checkpoints
│   └── docs.md
└── serialization/         # JSON/YAML persistence, schema migration
    └── docs.md
```

## Dependency Direction

All dependencies flow inward toward `domain`:

```
engine.py → ops, history, events
ops       → domain
history   → domain, ops.base
serialization → domain
events    → (no domain dependency)
```

`domain` is the innermost layer and has no imports outside itself.

## Files

### `engine.py` — EditEngine

The `EditEngine` is the sole entry point for all state mutations. It is documented in detail in [../docs.md](../docs.md) under "core/engine.py — EditEngine".

Key methods:
- `apply(operation, state)` — the pipeline (validate → pre-context → apply → log → snapshot-record → events)
- `undo(state)` — restores state from stored snapshot
- `redo(state)` — restores state from stored redo snapshot
- `_capture_pre_context(operation, state)` — builds pre-apply snapshot
- `_restore_state_from_snapshot(state, snapshot)` — reconstructs full state from a snapshot dict

Components owned by the engine:
- `OperationValidator` — validates operations
- `OperationLog` — append-only audit trail
- `UndoRedoController` — done/undone stacks with full state snapshots
- `CheckpointStore` — periodic state snapshots
- `DomainEventBus` — event emission

### `__init__.py`

Exports `engine` module. Public API: `from core.engine import EditEngine`.
