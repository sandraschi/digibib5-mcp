"""FastAPI-style REST bridge for the Digibib5 reader webapp.

Built on Starlette (a hard dependency of fastmcp, always present) so the reader
needs no extra install. Serves the same reverse-engineered DKI library the
`digibib` MCP tool exposes, as JSON over HTTP for the Vite/React frontend.

Run:  uv run python -m digibib5_mcp.api
Port: DIGIBIB_API_PORT env, default 14115. The Vite dev server (14114) proxies
/api -> here.
"""

from __future__ import annotations

import os

from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from .dki import MAX_NODE_RECORDS, DigibibLibrary


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


routes = [
    Route("/api/health", health),
    Route("/api/volumes", volumes),
    Route("/api/volume/{vid}/descriptor", descriptor),
    Route("/api/volume/{vid}/toc", toc),
    Route("/api/volume/{vid}/node/{idx:int}/text", node_text),
    Route("/api/volume/{vid}/record/{idx:int}/text", record_text),
    Route("/api/volume/{vid}/search", search),
]

middleware = [
    Middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET"],
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
