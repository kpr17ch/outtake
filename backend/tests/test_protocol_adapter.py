from backend.services.protocol_adapter import assistant_tool_use, sse_data, user_tool_result


def test_assistant_tool_use_shape():
    ev = assistant_tool_use("call-1", "ffmpeg/trim_video", {"a": 1})
    assert ev["type"] == "assistant"
    assert ev["message"]["content"][0]["type"] == "tool_use"
    assert ev["message"]["content"][0]["id"] == "call-1"
    assert ev["message"]["content"][0]["name"] == "ffmpeg/trim_video"


def test_user_tool_result_shape():
    ev = user_tool_result("call-1", {"ok": True})
    assert ev["type"] == "user"
    assert ev["tool_use_id"] == "call-1"
    assert "ok" in ev["tool_use_result"]


def test_sse_line_prefix():
    payload = {"type": "result", "result": "done"}
    raw = sse_data(payload).decode("utf-8")
    assert raw.startswith("data: ")
    assert raw.endswith("\n\n")
