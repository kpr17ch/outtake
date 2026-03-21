# schemas/ — JSON Schema Contracts

This directory contains JSON Schema definitions that serve as the formal contract for the data formats used in Outtake Edit Core. They are used for validation during serialization/deserialization and in contract tests.

## Role in the System

The schemas are the boundary contract between the core and any external system:
- The `StateSerializer` validates against `edit_graph.schema.json` when loading/saving
- Contract tests validate minimal payloads against both schemas
- External partners building integrations can use these schemas to validate their own output

---

## Files

### `edit_graph.schema.json` — EditGraphState Schema

Defines the structure of a complete project state file.

**Top-level required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `schema_version` | string | Version of this schema (e.g. "1.0.0") |
| `project_meta` | object | Arbitrary project metadata |
| `tracks` | array of `$defs/track` | Ordered timeline tracks |
| `entities` | object of `$defs/timelineEntity` | All entities keyed by ID |
| `asset_registry` | `$defs/assetRegistry` | All media references |

`additionalProperties: false` — no extra fields allowed at root level.

**Defined types (`$defs`):**

| Type | Required fields | Notes |
|------|----------------|-------|
| `rationalTime` | `value` (integer), `rate` (integer >= 1) | No additional properties |
| `timeRange` | `start`, `duration` (both rationalTime) | No additional properties |
| `timelineEntity` | `id`, `kind`, `schema_version`, `attributes`, `enabled` | Additional properties allowed (entities are extensible) |
| `track` | `id`, `kind`, `schema_version`, `attributes`, `enabled`, `track_type`, `item_ids`, `locked`, `muted`, `name` | No additional properties. `track_type` enum: `video`, `audio`, `subtitle` |
| `mediaReference` | `ref_id`, `kind`, `metadata` | Optional: `format_hint`, `file_path`, `available_range` (timeRange or null) |
| `assetRegistry` | `assets` (object of mediaReference) | No additional properties |

**Why `track` has all TimelineEntity fields:** `Track` inherits from `TimelineEntity` in Python, so `dataclasses.asdict()` includes all inherited fields. The schema must accept them.

---

### `operation.schema.json` — OperationEnvelope Schema

Defines the structure of a single operation as stored in the `OperationLog`.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `op_id` | string | Unique operation ID |
| `op_type` | string | Operation type ("insert_clip", "trim_clip", etc.) |
| `actor` | string | Who created the operation |
| `ts` | string | ISO timestamp |
| `payload` | object | Operation-specific data |

**Optional fields:**

| Field | Type | Description |
|-------|------|-------------|
| `causation_id` | string or null | ID of the causing operation |
| `correlation_id` | string or null | ID linking related operations |
| `preconditions` | array of objects | Pre-conditions for validation |

`additionalProperties: false` — the envelope format is strict.
