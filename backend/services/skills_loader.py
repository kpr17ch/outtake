"""Discover project skills (SKILL.md per folder) like LangChain Deep Agents — index only at startup, full body on demand."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class SkillIndexEntry:
    skill_id: str
    skill_path: Path
    name: str
    description: str
    tags: tuple[str, ...]


_SKILL_FILE_NAMES = ("SKILL.md", "Skill.md")


def _parse_simple_frontmatter(raw: str) -> tuple[dict[str, str], str]:
    """Parse YAML-like `---` frontmatter; values are single-line strings (Deep Agents style)."""
    text = raw.lstrip("\ufeff")
    if not text.startswith("---"):
        return {}, text
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?", text, re.DOTALL)
    if not m:
        return {}, text
    block = m.group(1)
    body = text[m.end() :]
    meta: dict[str, str] = {}
    for line in block.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        key, val = line.split(":", 1)
        k = key.strip()
        v = val.strip().strip('"').strip("'")
        meta[k] = v
    return meta, body


def _tags_from_meta(meta: dict[str, str]) -> tuple[str, ...]:
    t = meta.get("tags") or meta.get("triggers") or ""
    parts = [x.strip() for x in re.split(r"[,;]", t) if x.strip()]
    return tuple(parts)


def discover_skills(project_root: Path) -> list[SkillIndexEntry]:
    """Scan `<project_root>/skills/<skill_id>/SKILL.md` and return index entries (no full body)."""
    skills_root = (project_root / "skills").resolve()
    if not skills_root.is_dir():
        return []
    out: list[SkillIndexEntry] = []
    for child in sorted(skills_root.iterdir(), key=lambda p: p.name.lower()):
        if not child.is_dir() or child.name.startswith("."):
            continue
        skill_md: Path | None = None
        for name in _SKILL_FILE_NAMES:
            candidate = child / name
            if candidate.is_file():
                skill_md = candidate
                break
        if skill_md is None:
            continue
        try:
            raw = skill_md.read_text(encoding="utf-8")
        except OSError:
            continue
        meta, _body = _parse_simple_frontmatter(raw)
        sid = meta.get("name") or child.name
        desc = meta.get("description") or meta.get("summary") or f"Skill `{child.name}` (see SKILL.md)."
        tags = _tags_from_meta(meta)
        out.append(
            SkillIndexEntry(
                skill_id=child.name,
                skill_path=skill_md,
                name=sid,
                description=desc,
                tags=tags,
            )
        )
    return out


def format_skills_index(entries: list[SkillIndexEntry]) -> str:
    if not entries:
        return ""
    lines = [
        "## Skills index (progressive disclosure)",
        "",
        "Each skill lives under `skills/<skill_id>/SKILL.md`. Only this index is in your context. "
        "Before following a workflow, call **`load_skill`** with `skill_id` to load the full instructions. "
        "Optional: **`read_skill_file`** for files under `skills/` (e.g. `video-gen/references/model-reference.md`).",
        "",
    ]
    for e in entries:
        tag_s = f" Tags: {', '.join(e.tags)}." if e.tags else ""
        lines.append(f"- **`{e.skill_id}`** — {e.description}{tag_s}")
    lines.append("")
    return "\n".join(lines)


def load_skill_body(skill_path: Path) -> str:
    return skill_path.read_text(encoding="utf-8")


def read_skills_file(project_root: Path, relative_under_skills: str) -> str:
    """Read a file under `skills/` (no traversal). `relative_under_skills` e.g. `video-gen/references/model-reference.md`."""
    skills_root = (project_root / "skills").resolve()
    if ".." in relative_under_skills or relative_under_skills.startswith("/"):
        return "Error: invalid path"
    full = (skills_root / relative_under_skills).resolve()
    try:
        full.relative_to(skills_root)
    except ValueError:
        return "Error: path outside skills/"
    if not full.is_file():
        return f"Error: not found: {relative_under_skills}"
    return full.read_text(encoding="utf-8")[:50000]
