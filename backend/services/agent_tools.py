"""LangChain tools shared by LangGraph and Deep Agents backends."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any

from backend.services.skills_loader import discover_skills, load_skill_body, read_skills_file


def run_skill_command_tool(project_root: Path, workspace_path: Path):
    from langchain_core.tools import tool

    pr = str(project_root.resolve())
    ws = str(workspace_path.resolve())

    @tool("run_skill_command")
    def run_skill_command(command: str, cwd: str = "project") -> str:
        """Run one shell command line (chain with && if needed). cwd='project' = project root; cwd='workspace' = session workspace.

        Rules: `command` must be executable shell only — no markdown, no headings, no bullet lists, no code fences inside the string.
        Use absolute paths for files. Examples: `node transcribe-pipeline.mjs --video foo.mp4 --jobId j1 --skipRender` then a second call: `npx remotion render src/index.ts OuttakeMotion /abs/workspace/output/out.mp4`
        """
        if cwd not in ("project", "workspace"):
            return "Error: cwd must be 'project' or 'workspace'"
        base = Path(pr if cwd == "project" else ws).resolve()
        try:
            proc = subprocess.run(
                command,
                shell=True,
                cwd=str(base),
                capture_output=True,
                text=True,
                timeout=900,
                env=os.environ.copy(),
            )
        except subprocess.TimeoutExpired:
            return "Error: skill command timed out after 900s"
        except Exception as exc:
            return f"Error running command: {exc}"
        out = (proc.stdout or "") + ((proc.stderr or "") and "\n" + (proc.stderr or ""))
        tail = out[-12000:] if len(out) > 12000 else out
        return f"exit_code={proc.returncode}\n{tail}"

    return run_skill_command


def skill_disclosure_tools(project_root: Path):
    """Progressive disclosure: index in system prompt; full SKILL.md via tools (LangGraph path)."""
    from langchain_core.tools import tool

    by_id = {e.skill_id: e for e in discover_skills(project_root)}

    @tool("load_skill")
    def load_skill(skill_id: str) -> str:
        """Load full SKILL.md for a skill_id from the Skills index. Call before executing that skill's CLI or workflow."""
        sid = skill_id.strip()
        entry = by_id.get(sid)
        if not entry:
            known = ", ".join(sorted(by_id.keys())) if by_id else "(none)"
            return f"Unknown skill_id `{sid}`. Known: {known}"
        try:
            body = load_skill_body(entry.skill_path)
        except OSError as exc:
            return f"Error reading skill: {exc}"
        if len(body) > 45000:
            return body[:45000] + "\n\n...[truncated]"
        return body

    @tool("read_skill_file")
    def read_skill_file(relative_path: str) -> str:
        """Read a file under skills/ (references, etc.). Path relative to skills/, e.g. video-gen/references/model-reference.md"""
        return read_skills_file(project_root, relative_path.strip())

    return [load_skill, read_skill_file]
