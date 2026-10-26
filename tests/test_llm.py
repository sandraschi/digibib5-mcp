"""Hermetic LLM provider tests (no network, no discs).

Cloud tests use DIGIBIB_CACHE_DIR pointed at tmp_path; local probes hit
127.0.0.1 and fail closed (reachable False) without an engine running.
"""

from __future__ import annotations

import pytest

from digibib5_mcp import llm as llm_engine


@pytest.fixture
def tmp_cache(tmp_path, monkeypatch):
    monkeypatch.setenv("DIGIBIB_CACHE_DIR", str(tmp_path))
    for var in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "MODEL_API_KEY"):
        monkeypatch.delenv(var, raising=False)
    return tmp_path


def test_registry_shape():
    ids = [r["id"] for r in llm_engine.PROVIDERS]
    assert {"ollama", "lmstudio", "meta", "openai"} <= set(ids)
    assert llm_engine.require_provider("ollama")["kind"] == "local"
    try:
        llm_engine.require_provider("nope")
        raise AssertionError("unknown provider accepted")
    except ValueError:
        pass


def test_keystore_roundtrip(tmp_cache):
    assert llm_engine.get_key("openai") == ""
    llm_engine.save_key("openai", "sk-test-123")
    assert llm_engine.get_key("openai") == "sk-test-123"
    assert llm_engine.is_configured("openai") is True
    assert llm_engine.delete_key("openai") is True
    assert llm_engine.get_key("openai") == ""
    assert llm_engine.is_configured("openai") is False
    try:
        llm_engine.save_key("ollama", "x")
        raise AssertionError("local key accepted")
    except ValueError:
        pass


def test_settings_roundtrip(tmp_cache):
    assert llm_engine.load_settings() == {}
    llm_engine.save_settings("ollama", "", "qwen3:8b")
    assert llm_engine.load_settings()["model"] == "qwen3:8b"


@pytest.mark.asyncio
async def test_list_models_unkeyed_cloud():
    out = await llm_engine.list_models("openai")
    assert out["source"] == "curated" and out.get("key_missing") is True


@pytest.mark.asyncio
async def test_probe_local_closed():
    # No engine is guaranteed on CI; probe must fail closed, never raise.
    ok, models = await llm_engine.probe_local("vllm")
    assert isinstance(ok, bool) and isinstance(models, list)
