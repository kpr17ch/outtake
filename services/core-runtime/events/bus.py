from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class DomainEvent:
    event_type: str
    payload: dict[str, Any]


class StateObserver(Protocol):
    def on_event(self, event: DomainEvent) -> None:
        ...


class DomainEventBus:
    def __init__(self) -> None:
        self._subscribers: list[tuple[int, StateObserver]] = []

    def subscribe(self, observer: StateObserver, priority: int = 100) -> None:
        self._subscribers.append((priority, observer))
        self._subscribers.sort(key=lambda x: x[0])

    def emit(self, event: DomainEvent) -> None:
        for _, observer in self._subscribers:
            observer.on_event(event)
