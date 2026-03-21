# core/serialization/ — Persistence and Schema Migration

This package handles converting `EditGraphState` to/from JSON and YAML, validating against JSON Schema, and managing schema version evolution.

## Role in the System

Serialization is the I/O boundary. The core operates entirely in-memory on `EditGraphState` objects. When saving or loading a project, this package converts between the in-memory representation and the on-disk format.

```
Load: File (JSON/YAML) → StateSerializer.from_json() → validate schema → build EditGraphState
Save: EditGraphState → canonical_dict() → validate schema → StateSerializer.to_json() → File
```

---

## Files

### `serializer.py` — StateSerializer

**Constructor:** `StateSerializer(target_schema_version="1.0.0")`
- Loads `schemas/edit_graph.schema.json` from disk at initialization
- All operations validate against this schema

**Serialization (save):**
- `to_json(state, canonical=True)` → compact sorted JSON (canonical) or indented JSON
- `to_yaml(state)` → YAML via `yaml.safe_dump`
- Both use `state.canonical_dict()` which ensures deterministic output (sorted keys, Enums converted to primitives)

**Deserialization (load):**
- `from_json(data: str) → EditGraphState`
- `from_yaml(data: str) → EditGraphState`
- Both call `_from_mapping(payload)` which:
  1. Validates against JSON Schema
  2. Checks `schema_version` matches `target_schema_version` — raises `SchemaMigrationRequired` if not
  3. Reconstructs `AssetRegistry` with proper `available_range` (TimeRange from dict)
  4. Reconstructs all entities by `kind` (clip, gap, transition)
  5. Reconstructs `Track` objects (including inherited TimelineEntity fields)
  6. Calls `state.rebuild_indices()`

**Roundtrip guarantee:** `from_json(to_json(state)).state_hash == state.state_hash` — verified by tests.

---

### `migrations.py` — SchemaMigrator

Handles explicit schema evolution.

**`SchemaMigrationRequired`** — exception raised when versions don't match. This is intentional: no silent upgrades.

**`SchemaMigrator`**:
- `register(from_version, to_version, fn)` — registers a migration function `(dict → dict)`
- `migrate(data, from_version, to_version)` — runs the registered migration. Returns data unchanged if versions match. Raises `SchemaMigrationRequired` if no migration path exists.

Migration functions transform the raw dict *before* deserialization. This keeps the serializer simple — it only needs to handle the current version.

**Example future migration:**
```python
migrator = SchemaMigrator()
migrator.register("1.0.0", "1.1.0", lambda d: {**d, "schema_version": "1.1.0", "new_field": "default"})
```

---

### `__init__.py`

Exports module names: `serializer`, `migrations`.
