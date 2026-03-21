from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

import yaml
from jsonschema import validate

from core.domain.assets import AssetRegistry, ExternalFileReference
from core.domain.entities import Clip, Gap, TimelineEntity, Track, Transition
from core.domain.file_versions import FileVersionStore
from core.domain.state import EditGraphState
from core.domain.time import RationalTime, TimeRange
from core.serialization.migrations import SchemaMigrationRequired


class StateSerializer:
    def __init__(self, target_schema_version: str = "1.0.0") -> None:
        self.target_schema_version = target_schema_version
        schema_path = Path(__file__).resolve().parents[2] / "schemas" / "edit_graph.schema.json"
        self._schema = json.loads(schema_path.read_text(encoding="utf-8"))

    def to_json(self, state: EditGraphState, canonical: bool = True) -> str:
        if canonical:
            return json.dumps(state.canonical_dict(), sort_keys=True, separators=(",", ":"))
        return json.dumps(state.canonical_dict(), indent=2)

    def from_json(self, data: str) -> EditGraphState:
        payload = json.loads(data)
        return self._from_mapping(payload)

    def to_yaml(self, state: EditGraphState) -> str:
        return yaml.safe_dump(state.canonical_dict(), sort_keys=True)

    def from_yaml(self, data: str) -> EditGraphState:
        payload = yaml.safe_load(data)
        return self._from_mapping(payload)

    def from_mapping(self, payload: dict[str, Any]) -> EditGraphState:
        return self._from_mapping(payload)

    def _from_mapping(self, payload: dict[str, Any]) -> EditGraphState:
        validate(instance=payload, schema=self._schema)
        found = payload["schema_version"]
        if found != self.target_schema_version:
            raise SchemaMigrationRequired(
                f"Schema version mismatch: found={found} expected={self.target_schema_version}"
            )
        registry = AssetRegistry()
        for asset in payload["asset_registry"]["assets"].values():
            ar_raw = asset.get("available_range")
            available_range = None
            if ar_raw is not None:
                available_range = TimeRange(
                    start=RationalTime(**ar_raw["start"]),
                    duration=RationalTime(**ar_raw["duration"]),
                )
            ref = ExternalFileReference(
                file_path=asset.get("file_path", ""),
                format_hint=asset.get("format_hint"),
                available_range=available_range,
                metadata=asset.get("metadata", {}),
            )
            ref.ref_id = asset["ref_id"]
            registry.assets[ref.ref_id] = ref
        entities: dict[str, TimelineEntity] = {}
        for entity in payload["entities"].values():
            kind = entity["kind"]
            if kind == "clip":
                clip = Clip(
                    id=entity["id"],
                    kind=kind,
                    schema_version=entity["schema_version"],
                    attributes=entity.get("attributes", {}),
                    enabled=entity.get("enabled", True),
                    media_ref_id=entity["media_ref_id"],
                    source_in=RationalTime(**entity["source_in"]),
                    source_out=RationalTime(**entity["source_out"]),
                    effects=entity.get("effects", []),
                )
                entities[clip.id] = clip
            elif kind == "gap":
                gap = Gap(
                    id=entity["id"],
                    kind=kind,
                    schema_version=entity["schema_version"],
                    attributes=entity.get("attributes", {}),
                    enabled=entity.get("enabled", True),
                    duration=RationalTime(**entity["duration"]),
                )
                entities[gap.id] = gap
            elif kind == "transition":
                transition = Transition(
                    id=entity["id"],
                    kind=kind,
                    schema_version=entity["schema_version"],
                    attributes=entity.get("attributes", {}),
                    enabled=entity.get("enabled", True),
                    in_offset=RationalTime(**entity["in_offset"]),
                    out_offset=RationalTime(**entity["out_offset"]),
                    transition_type=entity["transition_type"],
                )
                entities[transition.id] = transition
        tracks = [Track(**track) for track in payload["tracks"]]
        state = EditGraphState(
            project_meta=payload["project_meta"],
            tracks=tracks,
            entities=entities,
            asset_registry=registry,
            file_versions=FileVersionStore.from_dict(payload.get("file_versions")),
            schema_version=payload["schema_version"],
        )
        state.rebuild_indices()
        return state
