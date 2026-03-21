# Outtake Edit Core — Project Documentation

## Purpose

Outtake Edit Core is the deterministic kernel for an AI-first video editor. It serves as the "operating system" layer between:
- **AI Brain** (generates edit operations)
- **UI Layer** (displays timeline, receives user input)
- **Render Pipeline** (consumes state to produce video output)

The core owns no media data — it manages logical references, timeline structure, and edit history.

## Architectural Principles

| Principle | Implementation |
|-----------|---------------|
| Single Source of Truth | `EditGraphState` holds all project data in one object |
| Operation-based mutations | Every change is a typed `BaseOperation` — no direct state manipulation |
| Deterministic replay | Same operations on same initial state → same `state_hash` |
| Inverse-based undo | Each operation builds its own inverse from a pre-apply snapshot |
| Explicit schema evolution | Version mismatch raises `SchemaMigrationRequired`, never auto-migrates |
| Single-threaded V1 | `EditEngine` is the sole entry point for mutations — no concurrency |

## Data Flow

```
Operation (from AI/UI/MCP)
  │
  ▼
EditEngine.apply()
  ├── 1. OperationValidator.validate()     → reject or continue
  ├── 2. _capture_pre_context()            → full state snapshot
  ├── 3. operation.apply(state)            → mutate EditGraphState
  ├── 4. operation.inverse(pre_context)    → create inverse operation
  ├── 5. OperationLog.append()             → append-only audit trail
  ├── 6. UndoRedoController.record()       → push snapshots to undo stack
  ├── 7. CheckpointStore.maybe_create()    → periodic full-state snapshot
  └── 8. DomainEventBus.emit()             → notify all observers
```

## Directory Map

| Directory | Purpose | docs.md |
|-----------|---------|---------|
| `core/domain/` | Data model: time, entities, assets, state | [core/domain/docs.md](core/domain/docs.md) |
| `core/ops/` | Operation framework: base class, registry, validation, built-in ops | [core/ops/docs.md](core/ops/docs.md) |
| `core/history/` | Undo/redo with snapshot restore, operation log, checkpoints | [core/history/docs.md](core/history/docs.md) |
| `core/serialization/` | JSON/YAML serialization, schema migration | [core/serialization/docs.md](core/serialization/docs.md) |
| `core/storage/` | Persistence adapters (SQLite ProjectStore + CAS ContentStore) | [core/storage/docs.md](core/storage/docs.md) |
| `core/engine.py` | Central orchestrator (`EditEngine`) | documented below |
| `events/` | Domain event bus for external observers | [events/docs.md](events/docs.md) |
| `schemas/` | JSON Schema contracts | [schemas/docs.md](schemas/docs.md) |
| `tests/` | Test pyramid | [tests/docs.md](tests/docs.md) |

## Root Files

### `pyproject.toml`
Python package configuration. Defines:
- Package name: `outtake-edit-core`
- Dependencies: `PyYAML`, `jsonschema`
- Dev dependencies: `pytest`
- Package list for `setuptools`

### `requirements.txt`
Pinned versions for `pip install -r`. Mirrors `pyproject.toml` dependencies.

### `Dockerfile`
Builds a `python:3.11-slim` container, installs dependencies, copies code, runs `pytest -q` as default command.

### `docker-compose.yml`
Three services for isolated test execution:
- `test` — full test suite
- `contract-test` — schema validation tests only
- `replay-test` — determinism replay tests only

### `Makefile`
Developer shortcuts:
- `make lint` — compile-check all source files
- `make test` — run full pytest
- `make contract-test` — run contract tests
- `make replay-test` — run replay tests

## `core/engine.py` — EditEngine

The `EditEngine` class is the sole entry point for all state mutations. It composes all subsystems:

| Component | Role |
|-----------|------|
| `OperationValidator` | Validates operations against state invariants |
| `OperationLog` | Append-only audit trail of forward operations |
| `UndoRedoController` | Done/undone stacks with full state snapshots for restore |
| `CheckpointStore` | Periodic full-state snapshots |
| `ProjectStore` *(optional)* | Persists state/logs/undo/checkpoints to SQLite |
| `DomainEventBus` | Notifies external observers |

### `apply(operation, state)`
The pipeline: validate → pre-context → apply → inverse → log → snapshot-record → events.
Raises `ValueError` and emits `OperationRejected` if validation fails.

### `undo(state)` / `redo(state)`
Snapshot-based: restores the full `EditGraphState` from the stored snapshot dict. Works for any operation type including dynamically generated MCP tool operations.

### `_capture_pre_context(operation, state)`
Builds a `PreApplyContext` snapshot including the full `state.canonical_dict()`. Additional op-type-specific data:
- `insert_clip`: stores the `clip_id` that will be inserted
- `trim_clip`: stores the full clip state *before* trim
- `delete_entity`: stores the entity data, its `track_id`, and its `position` in that track
