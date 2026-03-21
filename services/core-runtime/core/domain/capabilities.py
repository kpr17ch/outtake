from enum import Enum


class Capability(str, Enum):
    TRIMMABLE = "trimmable"
    MOVABLE = "movable"
    EFFECT_ATTACHABLE = "effect_attachable"
