from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from core.domain.state import EditGraphState
from core.history.log import OperationLogEntry


class ProjectStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self._conn = sqlite3.connect(str(db_path))
        self._conn.execute("pragma journal_mode=wal")
        self._conn.execute("pragma foreign_keys=on")
        self._init_tables()

    def _init_tables(self) -> None:
        self._conn.executescript(
            """
            create table if not exists operations (
                seq integer primary key autoincrement,
                op_id text not null unique,
                op_type text not null,
                ts text not null,
                actor text not null,
                causation_id text,
                correlation_id text,
                payload text not null,
                tool_schema_hash text,
                result_snapshot text,
                file_versions_before text
            );

            create table if not exists snapshots (
                checkpoint_id text primary key,
                state_json text not null,
                created_at text not null
            );

            create table if not exists undo_stack (
                seq integer primary key autoincrement,
                op_id text not null,
                inverse_op text not null,
                state_snapshot text not null,
                redo_snapshot text not null,
                stack text not null check(stack in ('done', 'undone'))
            );

            create table if not exists file_versions (
                ref_id text primary key,
                origin_ref_id text not null,
                file_path text not null,
                cas_hash text,
                version integer not null,
                created_by_op_id text not null
            );

            create table if not exists project_state (
                id integer primary key check(id = 1),
                state_json text not null,
                state_hash text not null,
                updated_at text not null
            );
            """
        )
        self._conn.commit()

    def save_operation(self, entry: OperationLogEntry) -> None:
        self._conn.execute(
            """
            insert into operations (
                op_id, op_type, ts, actor, causation_id, correlation_id, payload,
                tool_schema_hash, result_snapshot, file_versions_before
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            on conflict(op_id) do nothing
            """,
            (
                entry.op_id,
                entry.op_type,
                entry.ts,
                entry.actor,
                entry.causation_id,
                entry.correlation_id,
                json.dumps(entry.payload, sort_keys=True, separators=(",", ":")),
                entry.tool_schema_hash,
                json.dumps(entry.result_snapshot, sort_keys=True, separators=(",", ":"))
                if entry.result_snapshot is not None
                else None,
                json.dumps(entry.file_versions_before, sort_keys=True, separators=(",", ":"))
                if entry.file_versions_before is not None
                else None,
            ),
        )
        self._conn.commit()

    def save_snapshot(self, checkpoint_id: str, state_dict: dict[str, Any]) -> None:
        self._conn.execute(
            """
            insert or replace into snapshots (checkpoint_id, state_json, created_at)
            values (?, ?, ?)
            """,
            (
                checkpoint_id,
                json.dumps(state_dict, sort_keys=True, separators=(",", ":")),
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        self._conn.commit()

    def save_state(self, state: EditGraphState) -> None:
        state_dict = state.canonical_dict()
        self._conn.execute(
            """
            insert into project_state (id, state_json, state_hash, updated_at)
            values (1, ?, ?, ?)
            on conflict(id) do update set
              state_json=excluded.state_json,
              state_hash=excluded.state_hash,
              updated_at=excluded.updated_at
            """,
            (
                json.dumps(state_dict, sort_keys=True, separators=(",", ":")),
                state.state_hash,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        self._conn.commit()

    def save_undo_stack(self, done: list[dict[str, Any]], undone: list[dict[str, Any]]) -> None:
        self._conn.execute("delete from undo_stack")
        for item in done:
            self._insert_undo_item(item, "done")
        for item in undone:
            self._insert_undo_item(item, "undone")
        self._conn.commit()

    def _insert_undo_item(self, item: dict[str, Any], stack: str) -> None:
        self._conn.execute(
            """
            insert into undo_stack (op_id, inverse_op, state_snapshot, redo_snapshot, stack)
            values (?, ?, ?, ?, ?)
            """,
            (
                item["op_id"],
                json.dumps(item["inverse_op"], sort_keys=True, separators=(",", ":")),
                json.dumps(item.get("state_snapshot", {}), sort_keys=True, separators=(",", ":")),
                json.dumps(item.get("redo_snapshot", {}), sort_keys=True, separators=(",", ":")),
                stack,
            ),
        )

    def load_state(self) -> dict[str, Any] | None:
        row = self._conn.execute(
            "select state_json from project_state where id = 1"
        ).fetchone()
        if row is None:
            return None
        return json.loads(row[0])

    def load_operations(self) -> list[OperationLogEntry]:
        rows = self._conn.execute(
            """
            select op_id, op_type, ts, actor, causation_id, correlation_id, payload,
                   tool_schema_hash, result_snapshot, file_versions_before
            from operations
            order by seq asc
            """
        ).fetchall()
        entries: list[OperationLogEntry] = []
        for row in rows:
            entries.append(
                OperationLogEntry(
                    op_id=row[0],
                    op_type=row[1],
                    ts=row[2],
                    actor=row[3],
                    causation_id=row[4],
                    correlation_id=row[5],
                    payload=json.loads(row[6]),
                    tool_schema_hash=row[7],
                    result_snapshot=json.loads(row[8]) if row[8] else None,
                    file_versions_before=json.loads(row[9]) if row[9] else None,
                )
            )
        return entries

    def load_undo_stack(self) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        rows = self._conn.execute(
            """
            select op_id, inverse_op, state_snapshot, redo_snapshot, stack
            from undo_stack
            order by seq asc
            """
        ).fetchall()
        done: list[dict[str, Any]] = []
        undone: list[dict[str, Any]] = []
        for row in rows:
            item = {
                "op_id": row[0],
                "inverse_op": json.loads(row[1]),
                "state_snapshot": json.loads(row[2]),
                "redo_snapshot": json.loads(row[3]),
            }
            if row[4] == "done":
                done.append(item)
            else:
                undone.append(item)
        return done, undone

    def register_file(
        self,
        ref_id: str,
        origin_ref_id: str,
        file_path: str,
        cas_hash: str | None,
        version: int,
        op_id: str,
    ) -> None:
        self._conn.execute(
            """
            insert or replace into file_versions (
                ref_id, origin_ref_id, file_path, cas_hash, version, created_by_op_id
            )
            values (?, ?, ?, ?, ?, ?)
            """,
            (ref_id, origin_ref_id, file_path, cas_hash, version, op_id),
        )
        self._conn.commit()

    def list_file_versions(self, origin_ref_id: str | None = None) -> list[dict[str, Any]]:
        if origin_ref_id is None:
            rows = self._conn.execute(
                """
                select ref_id, origin_ref_id, file_path, cas_hash, version, created_by_op_id
                from file_versions
                order by origin_ref_id asc, version asc
                """
            ).fetchall()
        else:
            rows = self._conn.execute(
                """
                select ref_id, origin_ref_id, file_path, cas_hash, version, created_by_op_id
                from file_versions
                where origin_ref_id = ?
                order by version asc
                """,
                (origin_ref_id,),
            ).fetchall()
        return [
            {
                "ref_id": row[0],
                "origin_ref_id": row[1],
                "file_path": row[2],
                "cas_hash": row[3],
                "version": row[4],
                "created_by_op_id": row[5],
            }
            for row in rows
        ]

    def close(self) -> None:
        self._conn.close()
