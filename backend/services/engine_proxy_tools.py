"""Build LangChain tools from Engine-Proxy tool definitions (JSON Schema)."""

from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, Field, create_model

from backend.services.engine_proxy_client import EngineProxyClient


def sanitize_tool_name(op_type: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_]+", "_", op_type.replace("/", "_"))
    if safe and safe[0].isdigit():
        safe = "t_" + safe
    return safe or "engine_tool"


def _json_prop_to_field(name: str, spec: dict[str, Any], required: bool) -> tuple[type, Any]:
    desc = str(spec.get("description") or "")
    jtype = spec.get("type")
    if isinstance(jtype, list):
        jtype = next((t for t in jtype if t != "null"), None)
    if jtype == "number":
        py_t = float
    elif jtype == "integer":
        py_t = int
    elif jtype == "boolean":
        py_t = bool
    elif jtype == "array":
        py_t = list[Any]
    else:
        py_t = str

    if "default" in spec:
        d = spec["default"]
        return py_t, Field(default=d, description=desc)
    if required:
        return py_t, Field(..., description=desc)
    return py_t | None, Field(default=None, description=desc)


def _pydantic_model_from_input_schema(op_type: str, input_schema: dict[str, Any]) -> type[BaseModel]:
    props = input_schema.get("properties")
    if not isinstance(props, dict):
        props = {}
    req = set(input_schema.get("required") or [])
    if not isinstance(req, set):
        req = set(req) if isinstance(req, (list, tuple)) else set()
    fields: dict[str, tuple[type, Any]] = {}
    for pname, pspec in props.items():
        if not isinstance(pspec, dict):
            continue
        fields[pname] = _json_prop_to_field(pname, pspec, pname in req)
    model_name = sanitize_tool_name(op_type) + "_Args"
    if not fields:
        return create_model(model_name, __base__=BaseModel)
    return create_model(model_name, **fields)


def engine_tool_from_definition(
    client: EngineProxyClient,
    session_id: str,
    tool_def: dict[str, Any],
):
    from langchain_core.tools import StructuredTool

    op_type = str(tool_def.get("name") or "")
    description = str(tool_def.get("description") or op_type)
    schema = tool_def.get("inputSchema")
    if not isinstance(schema, dict):
        schema = {"type": "object", "properties": {}}
    props = schema.get("properties")
    has_params = isinstance(props, dict) and bool(props)
    safe_name = sanitize_tool_name(op_type)

    if not has_params:

        def _call_no_args() -> str:
            return str(client.call_tool(session_id, op_type, {}))

        return StructuredTool.from_function(
            name=safe_name,
            description=description,
            func=_call_no_args,
        )

    args_model = _pydantic_model_from_input_schema(op_type, schema)

    def _call(**kwargs: Any) -> str:
        cleaned = {k: v for k, v in kwargs.items() if v is not None}
        return str(client.call_tool(session_id, op_type, cleaned))

    return StructuredTool.from_function(
        name=safe_name,
        description=description,
        func=_call,
        args_schema=args_model,
    )


def tools_from_engine_list(session_id: str, client: EngineProxyClient) -> list[Any]:
    out: list[Any] = []
    for td in client.list_tools(session_id):
        if isinstance(td, dict) and td.get("name"):
            out.append(engine_tool_from_definition(client, session_id, td))
    return out
