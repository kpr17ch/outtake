from backend.services.sessions import create_session, get_session, update_session


def test_create_and_update_session():
    s = create_session("T1")
    assert s.title == "T1"
    loaded = get_session(s.id)
    assert loaded is not None
    assert loaded.id == s.id
    updated = update_session(s.id, {"title": "T2", "agentSessionId": "abc"})
    assert updated is not None
    assert updated.title == "T2"
    assert updated.agentSessionId == "abc"
