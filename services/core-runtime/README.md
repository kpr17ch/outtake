# Outtake Edit Core

Deterministic, extensible edit-core for AI-first video timeline editing.

Outtake Edit Core is the "operating system" between the AI-brain and the video editing modules. It owns the single source of truth for timeline state, enforces a typed operation pipeline, and provides full undo/redo through inverse operations — comparable to how Cursor manages code edits, but for video.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│  AI Brain / UI / External Caller                                 │
│  ─ creates BaseOperation instances                               │
└──────────────┬───────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│  EditEngine  (core/engine.py)                                    │
│  ┌────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────────┐   │
│  │Validate│→ │Pre-Context   │→ │Apply     │→ │Inverse Build │   │
│  │        │  │Capture       │  │          │  │              │   │
│  └────────┘  └──────────────┘  └──────────┘  └──────┬───────┘   │
│       │                              │               │           │
│       ▼                              ▼               ▼           │
│  OperationLog                  EditGraphState   UndoRedoCtrl     │
│  (append-only)                 (mutated)        (done/undone)    │
│       │                              │                           │
│       └──────────────┬───────────────┘                           │
│                      ▼                                           │
│               DomainEventBus                                     │
│               → StateChanged / OperationRejected / Undo / ...    │
└──────────────────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│  StateSerializer  (core/serialization/)                          │
│  JSON / YAML ←→ EditGraphState    (schema-validated)             │
└──────────────────────────────────────────────────────────────────┘
```

### Core Guarantees

1. **Single Source of Truth** — `EditGraphState` holds the complete project state (tracks, entities, assets). No secondary caches.
2. **Typed Operation Pipeline** — Every mutation passes through validate → pre-context → apply → inverse-build → log → event-emit. No bypasses.
3. **Deterministic Replay** — The same sequence of operations on the same initial state always produces the same `state_hash` (SHA-256 over canonical JSON).
4. **Undo/Redo via Inverse Operations** — Each forward operation builds its own inverse using a `PreApplyContext` snapshot captured *before* apply. No state cloning.
5. **Explicit Schema Migration** — Version mismatches raise `SchemaMigrationRequired` instead of silently upgrading.
6. **Plugin Extensibility** — New operation types register via `pyproject.toml` entry points without modifying core.

---

## Schematic: How a Typical Edit Session Works

Below is a concrete example of opening a project, adding a clip, trimming it, and saving — showing exactly what happens in each step, what the `OperationLog` records, and what the `EditGraphState` looks like.

### Step 1 — Load Project

```python
from core.serialization.serializer import StateSerializer

serializer = StateSerializer()
state = serializer.from_json(open("project.json").read())
engine = EditEngine()
```

The `EditGraphState` after load:

```json
{
  "schema_version": "1.0.0",
  "project_meta": {"name": "My Video", "fps": 25},
  "tracks": [
    {
      "id": "track-v1",
      "kind": "track",
      "schema_version": "1.0.0",
      "attributes": {},
      "enabled": true,
      "track_type": "video",
      "item_ids": [],
      "locked": false,
      "muted": false,
      "name": "V1"
    }
  ],
  "entities": {},
  "asset_registry": {
    "assets": {
      "media-001": {
        "ref_id": "media-001",
        "kind": "external_file",
        "file_path": "/footage/interview.mp4",
        "format_hint": "mp4",
        "available_range": {
          "start": {"value": 0, "rate": 25},
          "duration": {"value": 7500, "rate": 25}
        },
        "metadata": {}
      }
    }
  }
}
```

`OperationLog` at this point: **empty** — no operations applied yet.

---

### Step 2 — Insert a Clip (AI or User)

```python
op = InsertClipOperation(
    op_type="insert_clip",
    actor="ai",
    payload={
        "track_id": "track-v1",
        "position": 0,
        "media_ref_id": "media-001",
        "source_in": {"value": 0, "rate": 25},
        "source_out": {"value": 250, "rate": 25},
        "clip_id": "clip-001"
    }
)
engine.apply(op, state)
```

**What happens internally (6-step pipeline):**

| # | Step | What happens |
|---|------|-------------|
| 1 | **Validate** | `OperationValidator` checks: required fields present? `source_out` within `available_range` of `media-001`? `source_in` < `source_out`? |
| 2 | **Pre-Context Capture** | Engine snapshots `{"inserted_id": "clip-001"}` — needed later to build the inverse. |
| 3 | **Apply** | `InsertClipOperation.apply()` creates a `Clip` entity, inserts `"clip-001"` into `track-v1.item_ids[0]`, rebuilds indices. |
| 4 | **Inverse Build** | `InverseBuilder` calls `op.inverse(pre_context)` → returns a `DeleteEntityOperation(entity_id="clip-001")`. |
| 5 | **Log** | `OperationLog` appends the forward operation (never the inverse). |
| 6 | **Event Emit** | `DomainEventBus` emits `StateChanged` with the `StateDelta`. |

**OperationLog entry #1:**

```json
{
  "op_id": "a1b2c3d4-...",
  "op_type": "insert_clip",
  "ts": "2026-03-21T14:00:00.000000+00:00",
  "actor": "ai",
  "causation_id": null,
  "correlation_id": null,
  "payload": {
    "track_id": "track-v1",
    "position": 0,
    "media_ref_id": "media-001",
    "source_in": {"value": 0, "rate": 25},
    "source_out": {"value": 250, "rate": 25},
    "clip_id": "clip-001"
  }
}
```

**UndoRedoController after this step:**
- `_done` stack: `[UndoEntry(op_id="a1b2c3d4-...", inverse_op=DeleteEntityOperation)]`
- `_undone` stack: `[]`

**EditGraphState now has:**
- `tracks[0].item_ids = ["clip-001"]`
- `entities["clip-001"] = Clip(source_in=0/25, source_out=250/25)`

---

### Step 3 — Trim the Clip

```python
trim_op = TrimClipOperation(
    op_type="trim_clip",
    actor="ai",
    payload={
        "clip_id": "clip-001",
        "source_in": {"value": 50, "rate": 25},
        "source_out": {"value": 200, "rate": 25}
    }
)
engine.apply(trim_op, state)
```

**Pre-Context Capture** snapshots the clip *before* trim:
```json
{
  "clip_before": {
    "id": "clip-001",
    "source_in": {"value": 0, "rate": 25},
    "source_out": {"value": 250, "rate": 25},
    "..."
  }
}
```

**OperationLog entry #2:**

```json
{
  "op_id": "e5f6g7h8-...",
  "op_type": "trim_clip",
  "ts": "2026-03-21T14:00:05.000000+00:00",
  "actor": "ai",
  "causation_id": null,
  "correlation_id": null,
  "payload": {
    "clip_id": "clip-001",
    "source_in": {"value": 50, "rate": 25},
    "source_out": {"value": 200, "rate": 25}
  }
}
```

**Inverse operation stored:** `TrimClipOperation` with the *old* values `(source_in=0, source_out=250)`.

**UndoRedoController:**
- `_done` stack: `[insert_inverse, trim_inverse]`
- `_undone` stack: `[]`

---

### Step 4 — Undo the Trim

```python
engine.undo(state)
```

1. `UndoRedoController.pop_undo()` → returns `trim_inverse` (TrimClipOperation with old values)
2. `OperationApplier.apply(trim_inverse, state)` → restores `source_in=0, source_out=250`
3. `DomainEventBus` emits `UndoPerformed`

**UndoRedoController after undo:**
- `_done` stack: `[insert_inverse]`
- `_undone` stack: `[trim_inverse]`

The clip is back to its original 0–250 range.

---

### Step 5 — Save Project

```python
serializer = StateSerializer()
json_output = serializer.to_json(state, canonical=False)
with open("project.json", "w") as f:
    f.write(json_output)
```

The serializer:
1. Calls `state.canonical_dict()` — deterministic, sorted, Enum-free dict
2. Validates against `schemas/edit_graph.schema.json`
3. Outputs JSON (or YAML via `to_yaml`)

The saved file is the **complete** state — no separate operation log file needed for recovery (though the log can be persisted separately for audit/replay purposes).

---

### Complete OperationLog After the Session

```json
[
  {
    "op_id": "a1b2c3d4-...",
    "op_type": "insert_clip",
    "ts": "2026-03-21T14:00:00+00:00",
    "actor": "ai",
    "payload": {"track_id": "track-v1", "position": 0, "media_ref_id": "media-001", "source_in": {"value": 0, "rate": 25}, "source_out": {"value": 250, "rate": 25}, "clip_id": "clip-001"}
  },
  {
    "op_id": "e5f6g7h8-...",
    "op_type": "trim_clip",
    "ts": "2026-03-21T14:00:05+00:00",
    "actor": "ai",
    "payload": {"clip_id": "clip-001", "source_in": {"value": 50, "rate": 25}, "source_out": {"value": 200, "rate": 25}}
  }
]
```

The log stores **forward operations only**. Undo operations are NOT logged — they are ephemeral inverse operations stored in the `UndoRedoController`. This keeps the log clean and auditable.

---

## Audit Results (2026-03-21)

An exhaustive audit with 63 test cases uncovered and fixed **6 bugs** in the initial implementation:

| # | Severity | Component | Bug | Fix |
|---|----------|-----------|-----|-----|
| 1 | Medium | `OperationRegistry.build()` | `op_type` passed as both positional arg and in `**kwargs` → `TypeError` | Made `op_type` positional-only via `/` |
| 2 | High | `edit_graph.schema.json` | Track schema had `additionalProperties: false` but didn't include inherited `TimelineEntity` fields (`kind`, `schema_version`, `attributes`, `enabled`) → schema validation failed on serialized tracks | Added inherited fields to track schema |
| 3 | High | `canonical_dict()` | `dataclasses.asdict()` preserves `Enum` instances (e.g. `MediaReferenceKind`) → `yaml.safe_dump` crashes with `RepresenterError` | Added recursive `_primitize()` to convert Enums to `.value` |
| 4 | Medium | `canonical_dict()` | Same root cause as #3 — Enum values not primitive in JSON output, causing inconsistent serialization | Fixed together with #3 |
| 5 | **Critical** | `DeleteEntityOperation.inverse()` | `track_id` and `position` from `PreApplyContext` were NOT passed to `RestoreEntityOperation` → after undo, clip was restored in `entities` but NOT re-inserted into `track.item_ids` (invisible clip) | Forward `track_id` + `position` from snapshot into restore payload |
| 6 | **Critical** | `StateSerializer._from_mapping()` | `available_range` was hardcoded to `None` during deserialization → media range data lost → `state_hash` mismatch after JSON roundtrip | Reconstruct `TimeRange` from serialized `available_range` dict |

### Test Coverage

| Category | Count | Purpose |
|----------|-------|---------|
| Contract | 2 | Schema validation against `operation.schema.json` and `edit_graph.schema.json` |
| Replay | 1 | Deterministic `state_hash` after identical operation sequences |
| Integration | 1 | Full engine pipeline: log + events |
| Unit (original) | 3 | Basic insert/trim operations and undo |
| Unit (deep audit) | 47 | Exhaustive tests for all components: RationalTime, capabilities, asset registry, validator, engine pipeline, undo/redo, state hash, checkpoints, event bus, registry, migrations, serializer roundtrip |
| Unit (edge cases) | 9 | Delete+undo position restore, auto-generated clip IDs, multi-track, hash-after-roundtrip, restore-only-clip-v1 |
| **Total** | **63** | All passing |

---

## Directory Structure

```
Outtake/
├── core/                       # Core engine and domain logic
│   ├── domain/                 # Data model: entities, time, assets, state
│   ├── ops/                    # Operation framework: base, registry, validation, built-in ops
│   ├── history/                # Undo/redo, operation log, checkpoints, inverse builder
│   ├── serialization/          # JSON/YAML serialization, schema migration
│   └── engine.py               # Central orchestrator (EditEngine)
├── events/                     # Domain event bus for external observers
├── schemas/                    # JSON Schema contracts for state and operations
├── plugins/                    # Plugin extension point with example
├── tests/                      # Test pyramid: unit, integration, contract, replay
├── Dockerfile                  # Docker-first reproducible environment
├── docker-compose.yml          # Test orchestration
├── pyproject.toml              # Python package config + plugin entry points
├── requirements.txt            # Pinned dependencies
└── Makefile                    # Dev workflow commands
```

Each subdirectory contains a `docs.md` with detailed documentation of every file.

---

## Quickstart

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest -q
```

## Docker

```bash
docker compose run --rm test
docker compose run --rm contract-test
docker compose run --rm replay-test
```
