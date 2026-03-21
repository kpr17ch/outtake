# core/domain/ — Data Model

This package defines the fundamental data types that make up the timeline state. Everything in the system — clips, tracks, gaps, effects, assets — is represented by classes in this package. No business logic or mutation logic lives here; these are pure data containers with validation.

## Role in the System

The domain layer is at the bottom of the dependency graph. Every other package (`ops`, `history`, `serialization`, `engine`) imports from `domain`, but `domain` imports from nothing outside itself. This ensures the data model is stable and decoupled.

```
EditEngine → ops → domain
           → history → domain
           → serialization → domain
           → events (no domain dependency)
```

---

## Files

### `time.py` — Rational Time Arithmetic

Defines `RationalTime` and `TimeRange` as frozen dataclasses.

**`RationalTime(value: int, rate: int)`**
- Integer-only time representation to avoid floating-point drift
- `rate` must be > 0 (enforced in `__post_init__`)
- Supports `__sub__`, `__lt__`, `__le__` — all require matching `rate`
- Frozen (immutable) — any mutation creates a new instance

**`TimeRange(start: RationalTime, duration: RationalTime)`**
- `start` and `duration` must share the same `rate`
- `duration` must be >= 0
- `end_exclusive` property: `start.value + duration.value`

**Why integer time?** Video editing uses frame-accurate timing. `1/30` in float is `0.0333...` which accumulates rounding errors over thousands of frames. `RationalTime(1, 30)` is exact.

**Example:**
```python
t = RationalTime(100, 25)   # frame 100 at 25fps = 4.0 seconds
r = TimeRange(RationalTime(0, 25), RationalTime(250, 25))  # 0–10 seconds
r.end_exclusive  # RationalTime(250, 25)
```

---

### `capabilities.py` — Capability Enum

Defines `Capability(str, Enum)` with values:
- `TRIMMABLE` — entity can be trimmed (source_in/source_out changed)
- `MOVABLE` — entity can be moved between positions/tracks
- `EFFECT_ATTACHABLE` — effects can be added to this entity

Used by `TimelineEntity.get_capabilities()` to declare what operations are valid for a given entity type. The validator can check capabilities before applying operations.

---

### `assets.py` — Media References and Asset Registry

**`MediaReferenceKind(str, Enum)`** — classifies reference types:
- `EXTERNAL_FILE` — points to a file on disk (MP4, MOV, WAV, etc.)
- `IMAGE_SEQUENCE` — directory of numbered image files (EXR, PNG, etc.)
- `MISSING` — placeholder for unavailable media
- `GENERATOR` — procedurally generated content (color bars, black, etc.)

**`MediaReference`** — base dataclass with `ref_id`, `kind`, `available_range`, `metadata`.

**Concrete subtypes:**

| Class | Extra fields | Use case |
|-------|-------------|----------|
| `ExternalFileReference` | `file_path`, `format_hint` | Any media file (MP4, MOV, WAV, PNG) |
| `ImageSequenceReference` | `base_path`, `name_pattern`, `start_frame`, `frame_step` | VFX image sequences |
| `MissingReference` | — | Placeholder when media is offline |
| `GeneratorReference` | — | Synthetic sources (color bars, black) |

Each subtype auto-generates a UUID `ref_id` and sets the correct `kind` in its `__init__`.

**`AssetRegistry`** — holds `assets: dict[str, MediaReference]`:
- `register(ref)` → adds reference, returns `ref_id`
- `get(ref_id)` → returns reference, raises `KeyError` if unknown
- `resolve_range(ref_id)` → returns `available_range`, raises `ValueError` if `None`

The core never accesses physical files. It stores logical references. Actual file I/O is handled by external `MediaResolver` implementations.

---

### `entities.py` — Timeline Entities

**`TimelineEntity`** — abstract base for all timeline items:

| Field | Type | Purpose |
|-------|------|---------|
| `id` | `str` | Unique identifier (UUID) |
| `kind` | `str` | Type discriminator ("clip", "track", "gap", etc.) |
| `schema_version` | `str` | Version of this entity's schema |
| `attributes` | `dict` | Open extension point for custom key-value data |
| `enabled` | `bool` | Whether this entity is active |

`get_capabilities()` → returns `frozenset[Capability]()` (empty by default).

**Concrete entity types:**

| Class | Inherits | Key fields | Capabilities |
|-------|----------|-----------|--------------|
| `Track` | TimelineEntity | `track_type`, `item_ids`, `locked`, `muted`, `name` | none |
| `Clip` | TimelineEntity | `media_ref_id`, `source_in`, `source_out`, `effects` | TRIMMABLE, MOVABLE, EFFECT_ATTACHABLE |
| `Gap` | TimelineEntity | `duration` | none |
| `Transition` | TimelineEntity | `in_offset`, `out_offset`, `transition_type` | none |
| `EffectInstance` | TimelineEntity | `effect_type`, `params`, `target_item_id` | none |

**`Clip.timeline_duration`** — computed property: `source_out - source_in`.

**Positional model:** A clip's position in the timeline is determined solely by its index in `Track.item_ids`. There is no stored `timeline_start` field — this avoids sync issues between position and list ordering.

---

### `state.py` — EditGraphState

The **Single Source of Truth** for the entire project.

| Field | Type | Purpose |
|-------|------|---------|
| `project_meta` | `dict` | Project-level metadata (name, fps, etc.) |
| `tracks` | `list[Track]` | Ordered list of timeline tracks |
| `entities` | `dict[str, TimelineEntity]` | All entities by ID |
| `asset_registry` | `AssetRegistry` | All registered media references |
| `schema_version` | `str` | Current schema version |
| `_indices` | `dict[str, int]` | Ephemeral lookup cache (not persisted) |

**`rebuild_indices()`** — rebuilds the `_indices` cache from `Track.item_ids`. Called after every mutation.

**`canonical_dict()`** — produces a deterministic dict suitable for JSON/YAML serialization:
- Sorts entities and assets by key
- Converts Enum instances to their `.value` via `_primitize()`
- Excludes ephemeral `_indices`

**`state_hash`** (property) — SHA-256 of `canonical_dict()` serialized as compact JSON with sorted keys. Used for deterministic replay verification.

---

### `__init__.py`

Exports `EditGraphState` from the package. This is the only public API of `core.domain`.
