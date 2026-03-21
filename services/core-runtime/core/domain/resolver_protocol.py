from __future__ import annotations

from typing import Protocol

from .assets import MediaReference


class MediaResolver(Protocol):
    def resolve(self, reference: MediaReference) -> str:
        """Resolve logical media reference into a concrete URI/path."""
