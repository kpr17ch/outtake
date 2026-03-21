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
- `apply(operation, state)` — the 6-step pipeline (validate → pre-context → apply → inverse → log → events)
- `undo(state)` — pops inverse from undo stack and applies it
- `_capture_pre_context(operation, state)` — builds pre-apply snapshot

Components owned by the engine:
- `OperationValidator` — validates operations
- `OperationApplier` — applies operations
- `InverseBuilder` — constructs inverse operations
- `OperationLog` — append-only audit trail
- `UndoRedoController` — done/undone stacks
- `CheckpointStore` — periodic state snapshots
- `DomainEventBus` — event emission

### `__init__.py`

Exports `engine` module. Public API: `from core.engine import EditEngine`.
