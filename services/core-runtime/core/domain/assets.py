from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any
from uuid import uuid4

from .time import TimeRange


class MediaReferenceKind(str, Enum):
    EXTERNAL_FILE = "external_file"
    IMAGE_SEQUENCE = "image_sequence"
    MISSING = "missing"
    GENERATOR = "generator"


@dataclass
class MediaReference:
    ref_id: str
    kind: MediaReferenceKind
    available_range: TimeRange | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ExternalFileReference(MediaReference):
    file_path: str = ""
    format_hint: str | None = None

    def __init__(
        self,
        file_path: str,
        format_hint: str | None = None,
        available_range: TimeRange | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            ref_id=str(uuid4()),
            kind=MediaReferenceKind.EXTERNAL_FILE,
            available_range=available_range,
            metadata=metadata or {},
        )
        self.file_path = file_path
        self.format_hint = format_hint


@dataclass
class MissingReference(MediaReference):
    def __init__(self, metadata: dict[str, Any] | None = None) -> None:
        super().__init__(
            ref_id=str(uuid4()),
            kind=MediaReferenceKind.MISSING,
            available_range=None,
            metadata=metadata or {},
        )


@dataclass
class GeneratorReference(MediaReference):
    def __init__(self, metadata: dict[str, Any] | None = None) -> None:
        super().__init__(
            ref_id=str(uuid4()),
            kind=MediaReferenceKind.GENERATOR,
            available_range=None,
            metadata=metadata or {},
        )


@dataclass
class ImageSequenceReference(MediaReference):
    base_path: str = ""
    name_pattern: str = ""
    start_frame: int = 0
    frame_step: int = 1

    def __init__(
        self,
        base_path: str,
        name_pattern: str,
        start_frame: int = 0,
        frame_step: int = 1,
        available_range: TimeRange | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            ref_id=str(uuid4()),
            kind=MediaReferenceKind.IMAGE_SEQUENCE,
            available_range=available_range,
            metadata=metadata or {},
        )
        self.base_path = base_path
        self.name_pattern = name_pattern
        self.start_frame = start_frame
        self.frame_step = frame_step


@dataclass
class AssetRegistry:
    assets: dict[str, MediaReference] = field(default_factory=dict)

    def register(self, ref: MediaReference) -> str:
        self.assets[ref.ref_id] = ref
        return ref.ref_id

    def get(self, ref_id: str) -> MediaReference:
        if ref_id not in self.assets:
            raise KeyError(f"Unknown media reference: {ref_id}")
        return self.assets[ref_id]

    def resolve_range(self, ref_id: str) -> TimeRange:
        ref = self.get(ref_id)
        if ref.available_range is None:
            raise ValueError(f"No available_range for media reference: {ref_id}")
        return ref.available_range
