from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from core.domain.state import EditGraphState


@dataclass
class PreApplyContext:
    op_id: str
    snapshot: dict[str, Any]
    affected_track_ids: list[str]


@dataclass
class StateDelta:
    added: list[str] = field(default_factory=list)
    modified: list[str] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)
    affected_tracks: list[str] = field(default_factory=list)


@dataclass
class ValidationResult:
    ok: bool
    reason: str = ""


@dataclass
class BaseOperation:
    op_type: str
    actor: str
    payload: dict[str, Any]
    op_id: str = field(default_factory=lambda: str(uuid4()))
    ts: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    preconditions: list[dict[str, Any]] = field(default_factory=list)
    causation_id: str | None = None
    correlation_id: str | None = None

    def validate(self, state: EditGraphState) -> ValidationResult:
        return ValidationResult(ok=True)

    def apply(self, state: EditGraphState) -> StateDelta:
        raise NotImplementedError

    def inverse(self, pre_context: PreApplyContext) -> "BaseOperation":
        raise NotImplementedError
