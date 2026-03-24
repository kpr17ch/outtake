from __future__ import annotations

import json
from collections.abc import AsyncGenerator


def sse_data(payload: dict) -> bytes:
    return f"data: {json.dumps(payload, ensure_ascii=True)}\n\n".encode("utf-8")


async def emit_error(message: str) -> AsyncGenerator[bytes, None]:
    yield sse_data({"type": "error", "message": message})
    yield sse_data({"type": "result", "result": f"Error: {message}"})


def assistant_tool_use(call_id: str, name: str, tool_input: dict) -> dict:
    return {
        "type": "assistant",
        "message": {
            "role": "assistant",
            "content": [{"type": "tool_use", "id": call_id, "name": name, "input": tool_input}],
        },
    }


def user_tool_result(call_id: str, result: object) -> dict:
    return {
        "type": "user",
        "tool_use_id": call_id,
        "tool_use_result": result if isinstance(result, str) else json.dumps(result, indent=2, ensure_ascii=True),
    }
