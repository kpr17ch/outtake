"""LangChain tools shared by LangGraph and Deep Agents backends."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any

from backend.services.debug_session_log import append_ndjson
from backend.services.skills_loader import discover_skills, load_skill_body, read_skills_file


def run_skill_command_tool(project_root: Path, workspace_path: Path):
    from langchain_core.tools import tool

    pr = str(project_root.resolve())
    ws = str(workspace_path.resolve())
    cmd_timeout = int(os.environ.get("RUN_SKILL_COMMAND_TIMEOUT", "1800"))

    @tool("run_skill_command")
    def run_skill_command(command: str, cwd: str = "project") -> str:
        """Run one shell command line (chain with && if needed). cwd='project' = project root; cwd='workspace' = session workspace.

        Rules: `command` must be executable shell only — no markdown, no headings, no bullet lists, no code fences inside the string.
        Use absolute paths for files. Examples: `node transcribe-pipeline.mjs --video foo.mp4 --jobId j1 --skipRender` (default transcription: use --skipRender unless user needs preview MP4) then a second call: `npx remotion render src/index.ts OuttakeMotion /abs/workspace/output/out.mp4`
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
                timeout=cmd_timeout,
                env=os.environ.copy(),
            )
        except subprocess.TimeoutExpired:
            return f"Error: skill command timed out after {cmd_timeout}s"
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
    def load_skill(skill_id: str | None = None, seed_id: str | None = None) -> str:
        """Load full SKILL.md for a skill from the Skills index. Pass skill_id (folder name, e.g. video-gen). seed_id is accepted as a synonym if the model uses that name."""
        sid = (skill_id or seed_id or "").strip()
        # #region agent log
        append_ndjson(
            {
                "sessionId": "0985cd",
                "hypothesisId": "H1",
                "location": "agent_tools.load_skill",
                "message": "load_skill_invoked",
                "data": {
                    "skill_id_arg": skill_id,
                    "seed_id_arg": seed_id,
                    "sid": sid,
                },
            }
        )
        # #endregion
        if not sid:
            return "Error: pass skill_id (e.g. video-gen). Known skills are listed in the Skills index in the system prompt."
        entry = by_id.get(sid)
        # #region agent log
        append_ndjson(
            {
                "sessionId": "0985cd",
                "hypothesisId": "H1",
                "location": "agent_tools.load_skill",
                "message": "load_skill_resolved",
                "data": {
                    "sid": sid,
                    "found": entry is not None,
                    "resolved_skill_id": entry.skill_id if entry else None,
                },
            }
        )
        # #endregion
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
