from backend.services.settings_store import SessionSettings, masked_settings


def test_masked_settings_hides_key():
    data = masked_settings(SessionSettings(provider="openai", model="gpt-4o-mini", apiKey="sk-1234567890"))
    assert data["provider"] == "openai"
    assert data["model"] == "gpt-4o-mini"
    assert data["apiKey"].startswith("sk-1")
    assert "***" in data["apiKey"]
