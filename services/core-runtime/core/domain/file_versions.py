from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class FileVersion:
    ref_id: str
    origin_ref_id: str
    file_path: str
    version: int
    created_by_op_id: str


@dataclass
class FileVersionStore:
    versions: dict[str, list[FileVersion]] = field(default_factory=dict)
    active: dict[str, str] = field(default_factory=dict)

    def register_version(
        self, *, origin_ref_id: str, ref_id: str, file_path: str, created_by_op_id: str
    ) -> FileVersion:
        bucket = self.versions.setdefault(origin_ref_id, [])
        version = len(bucket) + 1
        fv = FileVersion(
            ref_id=ref_id,
            origin_ref_id=origin_ref_id,
            file_path=file_path,
            version=version,
            created_by_op_id=created_by_op_id,
        )
        bucket.append(fv)
        self.active[origin_ref_id] = ref_id
        return fv

    def get_active_version(self, origin_ref_id: str) -> FileVersion:
        ref_id = self.active.get(origin_ref_id)
        if ref_id is None:
            raise KeyError(f"No active version for origin: {origin_ref_id}")
        for version in self.versions.get(origin_ref_id, []):
            if version.ref_id == ref_id:
                return version
        raise KeyError(f"Active ref_id {ref_id} not found for origin: {origin_ref_id}")

    def rollback_to(self, origin_ref_id: str, version: int) -> FileVersion:
        for item in self.versions.get(origin_ref_id, []):
            if item.version == version:
                self.active[origin_ref_id] = item.ref_id
                return item
        raise KeyError(f"Version {version} not found for origin: {origin_ref_id}")

    def set_active_ref(self, origin_ref_id: str, ref_id: str) -> None:
        self.active[origin_ref_id] = ref_id

    def to_dict(self) -> dict[str, Any]:
        return {
            "versions": {
                origin_ref_id: [asdict(v) for v in items]
                for origin_ref_id, items in sorted(self.versions.items())
            },
            "active": dict(sorted(self.active.items())),
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any] | None) -> "FileVersionStore":
        if not payload:
            return cls()
        versions: dict[str, list[FileVersion]] = {}
        for origin_ref_id, items in payload.get("versions", {}).items():
            versions[origin_ref_id] = [FileVersion(**item) for item in items]
        active = dict(payload.get("active", {}))
        return cls(versions=versions, active=active)
