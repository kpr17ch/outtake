from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any

from .assets import AssetRegistry
from .entities import TimelineEntity, Track
from .file_versions import FileVersionStore


def _primitize(obj: Any) -> Any:
    """Recursively convert Enum instances to their .value so the dict is JSON/YAML safe."""
    if isinstance(obj, Enum):
        return obj.value
    if isinstance(obj, dict):
        return {k: _primitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_primitize(v) for v in obj]
    return obj


@dataclass
class EditGraphState:
    project_meta: dict[str, Any]
    tracks: list[Track]
    entities: dict[str, TimelineEntity]
    asset_registry: AssetRegistry
    file_versions: FileVersionStore = field(default_factory=FileVersionStore)
    schema_version: str = "1.0.0"
    _indices: dict[str, int] = field(default_factory=dict, repr=False)

    def rebuild_indices(self) -> None:
        indices: dict[str, int] = {}
        for track_index, track in enumerate(self.tracks):
            for i, item_id in enumerate(track.item_ids):
                indices[item_id] = track_index * 1_000_000 + i
        self._indices = indices

    def canonical_dict(self) -> dict[str, Any]:
        return _primitize({
            "schema_version": self.schema_version,
            "project_meta": self.project_meta,
            "tracks": [asdict(t) for t in self.tracks],
            "entities": {k: asdict(v) for k, v in sorted(self.entities.items())},
            "asset_registry": {
                "assets": {k: asdict(v) for k, v in sorted(self.asset_registry.assets.items())}
            },
            "file_versions": self.file_versions.to_dict(),
        })

    @property
    def state_hash(self) -> str:
        payload = json.dumps(self.canonical_dict(), sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()
