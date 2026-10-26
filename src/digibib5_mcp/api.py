"""FastAPI-style REST bridge for the Digibib5 reader webapp.

Built on Starlette (a hard dependency of fastmcp, always present) so the reader
needs no extra install. Serves the same reverse-engineered DKI library the
`digibib` MCP tool exposes, as JSON over HTTP for the Vite/React frontend.

Run:  uv run python -m digibib5_mcp.api
Port: DIGIBIB_API_PORT env, default 14115. The Vite dev server (14114) proxies
/api -> here.
"""

from __future__ import annotations

import asyncio
import collections
import inspect
import logging
import os
from collections.abc import AsyncIterator
from typing import Any

from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response, StreamingResponse
from starlette.routing import Route

from . import llm as llm_engine
from .dki import MAX_NODE_RECORDS, DigibibLibrary

# ------------------------------------------------------------- request log
LOG_BUFFER: collections.deque[dict[str, Any]] = collections.deque(maxlen=500)


class _RingHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            LOG_BUFFER.append(
                {
                    "timestamp": __import__("datetime")
                    .datetime.fromtimestamp(record.created)
                    .isoformat(timespec="seconds"),
                    "level": record.levelname.lower(),
                    "message": record.getMessage(),
                    "source": record.name,
                }
            )
        except Exception:
            pass


def _ensure_log_handler() -> None:
    root = logging.getLogger()
    if not any(isinstance(h, _RingHandler) for h in root.handlers):
        root.addHandler(_RingHandler())


_ensure_log_handler()


def _library(request: Request) -> DigibibLibrary:
    # Allow a ?root= override for ad-hoc testing; default to DIGIBIB_ROOT / K:\...
    root = request.query_params.get("root")
    return DigibibLibrary(root=root)


def _toc_dict(node, max_depth, depth=0):
    out = {
        "index": node.index,
        "title": node.title,
        "depth": node.depth,
        "record": node.record,
    }
    if max_depth is None or depth < max_depth:
        kids = [_toc_dict(c, max_depth, depth + 1) for c in node.children]
        if kids:
            out["children"] = kids
    elif node.children:
        out["children_count"] = len(node.children)
    return out


async def health(request: Request) -> JSONResponse:
    lib = _library(request)
    return JSONResponse(
        {
            "success": True,
            "service": "digibib5-mcp",
            "root": str(lib.root),
            "root_exists": lib.root.is_dir(),
        }
    )


async def volumes(request: Request) -> JSONResponse:
    lib = _library(request)
    vols = lib.list_volumes()
    return JSONResponse(
        {
            "success": True,
            "count": len(vols),
            "volumes": [{"id": v.id, "title": v.title} for v in vols],
        }
    )


def _open(request: Request):
    lib = _library(request)
    vid = request.path_params["vid"]
    return lib.open(vid), vid


async def descriptor(request: Request) -> JSONResponse:
    try:
        vol, vid = _open(request)
    except KeyError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=404)
    return JSONResponse({"success": True, "volume_id": vid, "title": vol.title, "descriptor": vol.descriptor})


async def toc(request: Request) -> JSONResponse:
    try:
        vol, vid = _open(request)
    except KeyError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=404)
    md = request.query_params.get("max_depth")
    max_depth = int(md) if md is not None and md != "" else None
    return JSONResponse(
        {
            "success": True,
            "volume_id": vid,
            "title": vol.title,
            "node_count": len(vol.toc_flat),
            "record_count": vol.record_count,
            "toc": [_toc_dict(r, max_depth) for r in vol.toc_tree()],
        }
    )


async def node_text(request: Request) -> JSONResponse:
    try:
        vol, vid = _open(request)
    except KeyError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=404)
    idx = int(request.path_params["idx"])
    try:
        node = vol.toc_flat[idx]
    except IndexError:
        return JSONResponse({"success": False, "error": f"node_index {idx} out of range."}, status_code=404)
    start, end = vol.node_extent(idx)
    if start is None or end is None:
        return JSONResponse(
            {
                "success": True,
                "volume_id": vid,
                "node_index": idx,
                "title": node.title,
                "record": None,
                "record_end": None,
                "records_total": 0,
                "truncated": False,
                "text": "",
            }
        )
    total = end - start
    return JSONResponse(
        {
            "success": True,
            "volume_id": vid,
            "node_index": idx,
            "title": node.title,
            "record": start,
            "record_end": end,
            "records_total": total,
            "truncated": total > MAX_NODE_RECORDS,
            "images": vol.node_image_refs(idx),
            "image_levels": vol.image_levels(),
            "text": vol.node_text(idx),
        }
    )


async def record_text(request: Request) -> JSONResponse:
    try:
        vol, vid = _open(request)
    except KeyError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=404)
    idx = int(request.path_params["idx"])
    try:
        text = vol.record_text(idx)
    except IndexError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=404)
    return JSONResponse({"success": True, "volume_id": vid, "record_index": idx, "text": text})


async def search(request: Request) -> JSONResponse:
    try:
        vol, vid = _open(request)
    except KeyError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=404)
    q = request.query_params.get("q", "")
    if not q.strip():
        return JSONResponse({"success": False, "error": "search needs ?q=."}, status_code=400)
    try:
        lim = int(request.query_params.get("limit", "20"))
    except ValueError:
        lim = 20
    hits = vol.search(q, lim)
    return JSONResponse({"success": True, "volume_id": vid, "query": q, "count": len(hits), "results": hits})


async def images(request: Request) -> JSONResponse:
    try:
        vol, vid = _open(request)
    except KeyError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=404)
    levels = vol.image_levels()
    lv_raw = request.query_params.get("level")
    try:
        lv = int(lv_raw) if lv_raw else None
    except ValueError:
        lv = None
    if lv not in levels:
        lv = max(levels) if levels else None
    figs = vol.images(lv) if lv is not None else []
    for f in figs:
        f["url"] = f"/api/volume/{vid}/image/{lv}/{f['name']}"
    return JSONResponse(
        {"success": True, "volume_id": vid, "levels": levels, "level": lv, "count": len(figs), "images": figs}
    )


async def image_file(request: Request) -> Response:
    try:
        vol, _vid = _open(request)
    except KeyError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=404)
    try:
        lv = int(request.path_params["level"])
        data = vol.image_bytes(lv, request.path_params["name"])
    except (ValueError, FileNotFoundError) as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=404)
    return Response(content=data, media_type="image/bmp")

    return Response(content=data, media_type="image/bmp")


async def logs(request: Request) -> JSONResponse:
    try:
        lim = int(request.query_params.get("limit", "200"))
    except ValueError:
        lim = 200
    entries = list(LOG_BUFFER)[-max(1, min(lim, 500)) :]
    return JSONResponse({"success": True, "count": len(entries), "logs": entries})


async def stats(request: Request) -> JSONResponse:
    lib = _library(request)
    vols = lib.list_volumes()
    total_records = 0
    total_figures = 0
    for v in vols:
        try:
            vol = lib.open(v.id)
            total_records += vol.record_count
            total_figures += len(vol.images())
        except Exception:
            continue
    index_db = llm_engine.data_dir() / "search.db"
    return JSONResponse(
        {
            "success": True,
            "volumes": len(vols),
            "total_records": total_records,
            "total_figures": total_figures,
            "index_bytes": index_db.stat().st_size if index_db.is_file() else 0,
        }
    )


# ------------------------------------------------------------- live tools
_OP_ORDER = ["list_volumes", "descriptor", "toc", "node_text", "record_text", "search", "images"]

_OP_ARGS: dict[str, list[str]] = {
    "list_volumes": [],
    "descriptor": ["volume_id"],
    "toc": ["volume_id", "max_depth"],
    "node_text": ["volume_id", "node_index"],
    "record_text": ["volume_id", "record_index"],
    "search": ["volume_id", "query", "limit"],
    "images": ["volume_id", "level"],
}


def _op_specs() -> list[dict[str, Any]]:
    """Tool schemas derived live from the digibib MCP function itself."""
    from .server import digibib

    fn = getattr(digibib, "fn", digibib)
    sig = inspect.signature(fn)
    descs: dict[str, str] = {}
    for line in (fn.__doc__ or "").splitlines():
        line = line.strip()
        if line.startswith("- `"):
            name = line[3:].split("`")[0]
            descs[name] = line.split("`", 2)[-1].strip(" -")
    ops = []
    for op in _OP_ORDER:
        props: dict[str, Any] = {}
        required: list[str] = []
        for arg in _OP_ARGS.get(op, []):
            param = sig.parameters.get(arg)
            desc = ""
            if param is not None:
                for meta in getattr(param.annotation, "__metadata__", []):
                    if hasattr(meta, "description"):
                        desc = meta.description or ""
                        break
            props[arg] = {"type": "string", "description": desc}
            if arg in ("volume_id", "query") or (op == "node_text" and arg == "node_index"):
                required.append(arg)
        ops.append(
            {
                "name": op,
                "description": descs.get(op, ""),
                "parameters": {"type": "object", "properties": props, "required": required},
            }
        )
    return ops


async def tools(request: Request) -> JSONResponse:
    return JSONResponse({"success": True, "count": len(_OP_ORDER), "tools": _op_specs()})


async def tool_detail(request: Request) -> JSONResponse:
    name = request.path_params["name"]
    for spec in _op_specs():
        if spec["name"] == name:
            return JSONResponse({"success": True, "tool": spec})
    return JSONResponse({"success": False, "error": f"unknown tool '{name}'"}, status_code=404)


async def tool_run(request: Request) -> JSONResponse:
    from .server import digibib

    name = request.path_params["name"]
    if name not in _OP_ARGS:
        return JSONResponse({"success": False, "error": f"unknown tool '{name}'"}, status_code=404)
    try:
        body = await request.json()
    except Exception:
        body = {}
    args = body.get("arguments", body) if isinstance(body, dict) else {}
    if not isinstance(args, dict):
        return JSONResponse({"success": False, "error": "arguments must be an object"}, status_code=400)
    allowed = set(_OP_ARGS[name]) | {"root"}
    kwargs = {k: v for k, v in args.items() if k in allowed}
    try:
        result = digibib(operation=name, **kwargs)
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)
    return JSONResponse({"success": True, "result": result})


# ------------------------------------------------------------- LLM proxy
async def llm_providers(request: Request) -> JSONResponse:
    infos = llm_engine.public_provider_info()
    probes = await asyncio.gather(*[llm_engine.probe_local(r["id"]) for r in infos if r["kind"] == "local"])
    det: dict[str, tuple[bool, list[str]]] = {}
    i = 0
    for r in infos:
        if r["kind"] == "local":
            det[r["id"]] = probes[i]
            i += 1
    for r in infos:
        if r["id"] in det:
            r["detected"] = det[r["id"]][0]
            r["models"] = det[r["id"]][1]
    return JSONResponse({"success": True, "providers": infos, "keys_configured": llm_engine.keys_configured()})


async def llm_models(request: Request) -> JSONResponse:
    provider = request.query_params.get("provider", "")
    try:
        return JSONResponse({"success": True, **await llm_engine.list_models(provider)})
    except ValueError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=400)


async def llm_test(request: Request) -> JSONResponse:
    try:
        body = await request.json()
    except Exception:
        body = {}
    provider = (body.get("provider") or "").strip() if isinstance(body, dict) else ""
    api_key = body.get("api_key", "") if isinstance(body, dict) else ""
    if not provider:
        return JSONResponse({"success": False, "error": "provider required"}, status_code=400)
    try:
        out = await llm_engine.list_models(provider, api_key=api_key)
    except ValueError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=400)
    ok = out.get("source") == "live" and not out.get("key_missing", False)
    return JSONResponse({"success": True, "ok": ok, **out})


async def llm_settings_get(request: Request) -> JSONResponse:
    return JSONResponse(
        {"success": True, "settings": llm_engine.load_settings(), "keys_configured": llm_engine.keys_configured()}
    )


async def llm_settings_save(request: Request) -> JSONResponse:
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        return JSONResponse({"success": False, "error": "object body required"}, status_code=400)
    provider = str(body.get("provider") or "")
    model = str(body.get("model") or "")
    endpoint = str(body.get("endpoint") or "")
    api_key = body.get("api_key")
    select = body.get("select", True)
    try:
        if api_key:
            llm_engine.require_provider(provider)
            llm_engine.save_key(provider, str(api_key))
        saved = llm_engine.save_settings(provider, endpoint, model) if provider else {}
        switch: dict[str, Any] = {}
        if select and provider == "ollama" and model:
            switch = await llm_engine.switch_ollama_model(model, endpoint or "http://127.0.0.1:11434")
        return JSONResponse({"success": True, "key_saved": bool(api_key), "saved": saved, "switch": switch})
    except (ValueError, RuntimeError) as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=400)


async def llm_settings_delete_key(request: Request) -> JSONResponse:
    provider = request.query_params.get("provider", "")
    try:
        deleted = llm_engine.delete_key(provider)
    except ValueError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=400)
    return JSONResponse({"success": True, "deleted": deleted})


async def llm_chat(request: Request) -> JSONResponse:
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        return JSONResponse({"success": False, "error": "object body required"}, status_code=400)
    try:
        text = await llm_engine.chat_complete(
            str(body.get("provider") or ""),
            str(body.get("model") or ""),
            body.get("messages") or [],
        )
    except (ValueError, RuntimeError) as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=502)
    return JSONResponse({"success": True, "content": text})


async def llm_chat_stream(request: Request) -> StreamingResponse:
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}

    async def gen() -> AsyncIterator[bytes]:
        try:
            async for chunk in llm_engine.chat_stream(
                str(body.get("provider") or ""),
                str(body.get("model") or ""),
                body.get("messages") or [],
            ):
                yield chunk
        except Exception as e:
            yield f'data: {{"error": {str(e)!r}}}\n\n'.encode()

    return StreamingResponse(gen(), media_type="text/event-stream")


async def llm_gpus(request: Request) -> JSONResponse:
    gpus = await asyncio.to_thread(llm_engine.gpu_vram)
    return JSONResponse(
        {
            "success": True,
            "gpus": [
                {
                    "index": g["index"],
                    "name": g["name"],
                    "vramMb": g["total_mb"],
                    "usedMb": g["used_mb"],
                    "freeMb": g["free_mb"],
                }
                for g in gpus
            ],
        }
    )


async def llm_loaded(request: Request) -> JSONResponse:
    provider = request.query_params.get("provider", "ollama")
    endpoint = request.query_params.get("endpoint") or ""
    if provider != "ollama":
        return JSONResponse({"success": True, "engine": False, "models": [], "note": "only ollama tracked"})
    base = endpoint or "http://127.0.0.1:11434"
    return JSONResponse({"success": True, **await llm_engine.ollama_loaded(base)})


async def llm_unload(request: Request) -> JSONResponse:
    try:
        body = await request.json()
    except Exception:
        body = {}
    provider = body.get("provider", "ollama") if isinstance(body, dict) else "ollama"
    endpoint = body.get("endpoint", "") if isinstance(body, dict) else ""
    if provider != "ollama":
        return JSONResponse({"success": True, "evicted": [], "note": "only ollama tracked"})
    out = await llm_engine.switch_ollama_model("", endpoint or "http://127.0.0.1:11434")
    return JSONResponse({"success": True, **out})


async def llm_onboarding(request: Request) -> JSONResponse:
    return JSONResponse({"success": True, **llm_engine.onboarding_state()})


async def llm_install(request: Request) -> JSONResponse:
    try:
        body = await request.json()
    except Exception:
        body = {}
    engine = body.get("engine", "") if isinstance(body, dict) else ""
    try:
        return JSONResponse({"success": True, **llm_engine.start_install(engine)})
    except (ValueError, RuntimeError) as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=400)


async def llm_install_status(request: Request) -> JSONResponse:
    engine = request.query_params.get("engine", "")
    try:
        return JSONResponse({"success": True, **llm_engine.install_status(engine)})
    except ValueError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=400)


routes = [
    Route("/api/health", health),
    Route("/api/volumes", volumes),
    Route("/api/volume/{vid}/descriptor", descriptor),
    Route("/api/volume/{vid}/toc", toc),
    Route("/api/volume/{vid}/node/{idx:int}/text", node_text),
    Route("/api/volume/{vid}/record/{idx:int}/text", record_text),
    Route("/api/volume/{vid}/search", search),
    Route("/api/volume/{vid}/images", images),
    Route("/api/volume/{vid}/image/{level:int}/{name:str}", image_file),
    Route("/api/logs", logs),
    Route("/api/stats", stats),
    Route("/api/tools", tools),
    Route("/api/tools/{name:str}", tool_detail, methods=["GET"]),
    Route("/api/tools/{name:str}/run", tool_run, methods=["POST"]),
    Route("/api/llm/providers", llm_providers),
    Route("/api/llm/models", llm_models),
    Route("/api/llm/test", llm_test, methods=["POST"]),
    Route("/api/settings/llm", llm_settings_get, methods=["GET"]),
    Route("/api/settings/llm", llm_settings_save, methods=["POST"]),
    Route("/api/settings/llm/key", llm_settings_delete_key, methods=["DELETE"]),
    Route("/api/llm/chat", llm_chat, methods=["POST"]),
    Route("/api/llm/chat/stream", llm_chat_stream, methods=["POST"]),
    Route("/api/llm/gpus", llm_gpus),
    Route("/api/llm/loaded", llm_loaded),
    Route("/api/llm/unload", llm_unload, methods=["POST"]),
    Route("/api/llm/onboarding", llm_onboarding),
    Route("/api/llm/install", llm_install, methods=["POST"]),
    Route("/api/llm/install/status", llm_install_status),
]

middleware = [
    Middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["*"],
    )
]

app = Starlette(routes=routes, middleware=middleware)


def main() -> None:
    import uvicorn

    port = int(os.environ.get("DIGIBIB_API_PORT", "14115"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    main()
