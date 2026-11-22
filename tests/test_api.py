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
    tools = r.json()["tools"]
    names = [t["name"] for t in tools]
    assert names == ["list_volumes", "stats", "descriptor", "toc", "node_text", "record_text", "search", "images"]
    by_name = {t["name"]: t for t in tools}
    for t in tools:
        assert t["parameters"]["type"] == "object"
    assert by_name["node_text"]["parameters"]["properties"]["node_index"]["type"] == "integer"
    assert by_name["record_text"]["parameters"]["properties"]["record_index"]["type"] == "integer"
    assert "volume_id" not in by_name["search"]["parameters"]["required"]


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
    r = c.post("/api/tools/record_text/run", json={"arguments": {"volume_id": "DB008", "record_index": "abc"}})
    assert r.status_code == 400
    r = c.post("/api/tools/stats/run", json={"arguments": {}})
    assert r.status_code == 200 and r.json()["result"]["success"] is True


def test_global_search_endpoint(monkeypatch, tmp_path):
    monkeypatch.setenv("DIGIBIB_CACHE_DIR", str(tmp_path))
    c = _client()
    assert c.get("/api/search").status_code == 400
    r = c.get("/api/search?q=hoffmann")
    assert r.status_code == 200
    d = r.json()
    assert d["success"] is True and d["results"] == []


def test_library_settings_roundtrip(monkeypatch, tmp_path):
    monkeypatch.setenv("DIGIBIB_CACHE_DIR", str(tmp_path))
    vol_dir = tmp_path / "lib" / "DB999" / "data"
    vol_dir.mkdir(parents=True)
    (vol_dir / "DIGIBIB.TXT").write_text("[Index]\nCaption=Test Volume\n", encoding="utf-8")

    c = _client()
    r = c.get("/api/settings/library")
    assert r.status_code == 200
    assert r.json()["onboarded"] is False

    t = c.post("/api/settings/library/test", json={"root": str(tmp_path / "lib")})
    assert t.status_code == 200
    assert t.json()["ok"] is True
    assert t.json()["volume_count"] == 1
    assert t.json()["sample_volumes"][0]["id"] == "DB999"

    s = c.post("/api/settings/library", json={"root": str(tmp_path / "lib"), "onboarded": True})
    assert s.status_code == 200
    assert s.json()["onboarded"] is True
    assert s.json()["source"] == "saved"
    assert s.json()["volume_count"] == 1


def test_catalog_endpoint(monkeypatch, tmp_path):
    monkeypatch.setenv("DIGIBIB_CACHE_DIR", str(tmp_path))
    monkeypatch.setenv("DIGIBIB_ROOT", str(tmp_path / "empty"))
    r = _client().get("/api/catalog")
    assert r.status_code == 200
    d = r.json()
    assert d["success"] is True
    assert d["count"] >= 76
    assert "Philosophy" in d["categories"]


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
