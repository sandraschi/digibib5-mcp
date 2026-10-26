"""Hermetic REST contract tests (no discs, no network, no LLM engine)."""

from __future__ import annotations

from starlette.testclient import TestClient

from digibib5_mcp.api import app


def _client() -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


def test_logs_endpoint():
    r = _client().get("/api/logs?limit=5")
    assert r.status_code == 200
    d = r.json()
    assert isinstance(d["logs"], list)


def test_tools_catalog_is_live():
    r = _client().get("/api/tools")
    assert r.status_code == 200
    names = [t["name"] for t in r.json()["tools"]]
    assert names == ["list_volumes", "descriptor", "toc", "node_text", "record_text", "search", "images"]
    for t in r.json()["tools"]:
        assert t["parameters"]["type"] == "object"


def test_tool_detail_and_unknown():
    c = _client()
    r = c.get("/api/tools/search")
    assert r.status_code == 200
    assert r.json()["tool"]["name"] == "search"
    assert c.get("/api/tools/nope").status_code == 404
    r = c.post("/api/tools/nope/run", json={"arguments": {}})
    assert r.status_code == 404
    r = c.post("/api/tools/search/run", json={"arguments": "not-an-object"})
    assert r.status_code == 400


def test_llm_registry_endpoints():
    c = _client()
    r = c.get("/api/llm/providers")
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()["providers"]]
    assert "ollama" in ids and "meta" in ids
    for p in r.json()["providers"]:
        assert p.get("api_key") is None  # never key bytes
    assert c.get("/api/llm/onboarding").status_code == 200
    assert c.get("/api/llm/gpus").status_code == 200


def test_settings_keys_roundtrip(monkeypatch, tmp_path):
    monkeypatch.setenv("DIGIBIB_CACHE_DIR", str(tmp_path))
    for var in ("OPENAI_API_KEY",):
        monkeypatch.delenv(var, raising=False)
    c = _client()
    assert c.get("/api/settings/llm").status_code == 200
    r = c.post("/api/settings/llm", json={"provider": "openai", "model": "gpt-4o-mini", "api_key": "sk-test"})
    assert r.status_code == 200 and r.json()["key_saved"] is True
    r = c.delete("/api/settings/llm/key?provider=openai")
    assert r.json()["deleted"] is True
    r = c.post("/api/llm/test", json={"provider": "openai"})
    assert r.json()["key_missing"] is True
