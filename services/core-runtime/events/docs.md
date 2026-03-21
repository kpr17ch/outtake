# events/ — Domain Event Bus

This package provides a synchronous, priority-ordered event dispatch system. External modules (UI, renderer, AI-brain, analytics) subscribe to state changes without coupling to the core.

## Role in the System

The event bus is the last step in the `EditEngine.apply()` pipeline. After an operation is applied, logged, and undo-recorded, the engine emits events to notify observers:

```
EditEngine.apply()
  └── DomainEventBus.emit(StateChanged)

EditEngine.undo()
  └── DomainEventBus.emit(UndoPerformed)
```

Observers are decoupled — they implement the `StateObserver` protocol and subscribe with a priority.

---

## Files

### `bus.py` — DomainEvent, StateObserver, DomainEventBus

**`DomainEvent(frozen=True)`**:

| Field | Type | Purpose |
|-------|------|---------|
| `event_type` | `str` | Event name (see table below) |
| `payload` | `dict` | Event-specific data |

**Event types emitted by the engine:**

| Event | When | Payload |
|-------|------|---------|
| `StateChanged` | After successful apply | `{"op_id": "...", "delta": {"added": [...], "modified": [...], "removed": [...], "affected_tracks": [...]}}` |
| `OperationRejected` | Validation failed | `{"op_id": "...", "reason": "..."}` |
| `UndoPerformed` | After undo | `{"op_id": "..."}` |
| `CheckpointCreated` | When checkpoint policy triggers | `{"checkpoint_id": "..."}` |

**`StateObserver(Protocol)`**:
```python
class StateObserver(Protocol):
    def on_event(self, event: DomainEvent) -> None: ...
```

Any class implementing `on_event` can be subscribed.

**`DomainEventBus`**:
- `subscribe(observer, priority=100)` — lower priority number = called first
- `emit(event)` — calls all observers in priority order, synchronously

**Priority ordering example:**
```python
bus.subscribe(renderer, priority=50)     # called first
bus.subscribe(ui_updater, priority=100)  # called second
bus.subscribe(analytics, priority=200)   # called third
```

---

### `__init__.py`

Exports module name: `bus`.
