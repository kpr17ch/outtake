from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RationalTime:
    value: int
    rate: int

    def __post_init__(self) -> None:
        if self.rate <= 0:
            raise ValueError("rate must be > 0")

    def __sub__(self, other: "RationalTime") -> "RationalTime":
        if self.rate != other.rate:
            raise ValueError("rates must match")
        return RationalTime(value=self.value - other.value, rate=self.rate)

    def __lt__(self, other: "RationalTime") -> bool:
        self._ensure_rate(other)
        return self.value < other.value

    def __le__(self, other: "RationalTime") -> bool:
        self._ensure_rate(other)
        return self.value <= other.value

    def _ensure_rate(self, other: "RationalTime") -> None:
        if self.rate != other.rate:
            raise ValueError("rates must match")


@dataclass(frozen=True)
class TimeRange:
    start: RationalTime
    duration: RationalTime

    def __post_init__(self) -> None:
        if self.start.rate != self.duration.rate:
            raise ValueError("time range rate mismatch")
        if self.duration.value < 0:
            raise ValueError("duration must be >= 0")

    @property
    def end_exclusive(self) -> RationalTime:
        return RationalTime(self.start.value + self.duration.value, self.start.rate)
