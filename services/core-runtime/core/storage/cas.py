from __future__ import annotations

import hashlib
import shutil
from pathlib import Path


class ContentStore:
    def __init__(self, base_dir: Path) -> None:
        self._base = base_dir / ".cas"
        self._base.mkdir(parents=True, exist_ok=True)

    def put(self, src_path: Path) -> str:
        if not src_path.exists():
            raise FileNotFoundError(str(src_path))
        digest = self._sha256(src_path)
        suffix = src_path.suffix
        target = self.get_path(digest, suffix=suffix)
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            shutil.copy2(src_path, target)
        return digest

    def get_path(self, cas_hash: str, suffix: str = "") -> Path:
        return self._base / cas_hash[:2] / cas_hash[2:4] / f"{cas_hash}{suffix}"

    def exists(self, cas_hash: str, suffix: str = "") -> bool:
        return self.get_path(cas_hash, suffix=suffix).exists()

    @staticmethod
    def _sha256(path: Path) -> str:
        h = hashlib.sha256()
        with path.open("rb") as fp:
            while True:
                chunk = fp.read(1024 * 1024)
                if not chunk:
                    break
                h.update(chunk)
        return h.hexdigest()
