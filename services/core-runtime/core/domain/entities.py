from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .capabilities import Capability
from .time import RationalTime


AttributeValue = str | int | float | bool | None | list[Any] | dict[str, Any]


@dataclass
class TimelineEntity:
    id: str
    kind: str
    schema_version: str
    attributes: dict[str, AttributeValue] = field(default_factory=dict)
    enabled: bool = True

    def get_capabilities(self) -> frozenset[Capability]:
        return frozenset()


@dataclass
class Track(TimelineEntity):
    track_type: str = "video"
    item_ids: list[str] = field(default_factory=list)
    locked: bool = False
    muted: bool = False
    name: str = ""


@dataclass
class Clip(TimelineEntity):
    media_ref_id: str = ""
    source_in: RationalTime = field(default_factory=lambda: RationalTime(0, 25))
    source_out: RationalTime = field(default_factory=lambda: RationalTime(0, 25))
    effects: list[str] = field(default_factory=list)

    def get_capabilities(self) -> frozenset[Capability]:
        return frozenset(
            {Capability.TRIMMABLE, Capability.MOVABLE, Capability.EFFECT_ATTACHABLE}
        )

    @property
    def timeline_duration(self) -> RationalTime:
        return self.source_out - self.source_in


@dataclass
class Gap(TimelineEntity):
    duration: RationalTime = field(default_factory=lambda: RationalTime(0, 25))


@dataclass
class Transition(TimelineEntity):
    in_offset: RationalTime = field(default_factory=lambda: RationalTime(0, 25))
    out_offset: RationalTime = field(default_factory=lambda: RationalTime(0, 25))
    transition_type: str = "cross_dissolve"


@dataclass
class EffectInstance(TimelineEntity):
    effect_type: str = ""
    params: dict[str, AttributeValue] = field(default_factory=dict)
    target_item_id: str = ""
