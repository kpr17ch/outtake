import json
from pathlib import Path

from jsonschema import validate


def test_operation_schema_minimal_envelope() -> None:
    schema_path = Path(__file__).resolve().parents[2] / "schemas" / "operation.schema.json"
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    payload = {
        "op_id": "op-1",
        "op_type": "insert_clip",
        "actor": "ai",
        "ts": "2026-03-21T00:00:00Z",
        "payload": {"track_id": "t1"},
    }
    validate(instance=payload, schema=schema)


def test_edit_graph_schema_minimal_state() -> None:
    schema_path = Path(__file__).resolve().parents[2] / "schemas" / "edit_graph.schema.json"
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    payload = {
        "schema_version": "1.0.0",
        "project_meta": {},
        "tracks": [],
        "entities": {},
        "asset_registry": {"assets": {}},
        "file_versions": {"versions": {}, "active": {}},
    }
    validate(instance=payload, schema=schema)
