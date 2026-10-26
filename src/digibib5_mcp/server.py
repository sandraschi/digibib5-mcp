"""digibib5-mcp - read Digitale Bibliothek 5 CD-ROM volumes over MCP.

A clone-in-progress of the Digitale Bibliothek 5 reader. This server exposes the
reverse-engineered DKI library (volume discovery, TOC, decoded text) as one
`digibib` portmanteau tool. The text codec is v1/approximate (see
src/digibib5_mcp/dki and reversing-mcp/docs/DIGIBIB5_DKI_FORMAT.md); the
TREE.DKA node->record mapping is solved (1-based table for all nodes but the
root, located by monotonic-run scan).
"""

from __future__ import annotations

from typing import Annotated, Any

from fastmcp import FastMCP
from pydantic import Field

from .dki import MAX_NODE_RECORDS, DigibibLibrary

mcp = FastMCP("digibib5-mcp", version="0.3.0")


def _toc_dict(node, max_depth: int | None, depth: int = 0) -> dict[str, Any]:
    out: dict[str, Any] = {
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


@mcp.tool
def digibib(
    operation: Annotated[
        str,
        Field(description="list_volumes | descriptor | toc | node_text | record_text | search | images"),
    ] = "list_volumes",
    volume_id: Annotated[
        str | None, Field(description="Volume folder id, e.g. 'DB008' (all ops except list_volumes).")
    ] = None,
    node_index: Annotated[int | None, Field(description="toc node index (node_text).")] = None,
    record_index: Annotated[int | None, Field(description="record index (record_text).")] = None,
    max_depth: Annotated[int | None, Field(description="toc: limit nesting depth.")] = None,
    query: Annotated[
        str | None, Field(description='search: FTS5 query (words, AND/OR/NOT, "phrase", prefix*).')
    ] = None,
    limit: Annotated[int | None, Field(description="search: max hits (default 20, max 100).")] = None,
    level: Annotated[int | None, Field(description="images: zoom level (default: highest).")] = None,
    root: Annotated[
        str | None, Field(description="Override the install root (default DIGIBIB_ROOT or K:\\...).")
    ] = None,
) -> dict[str, Any]:
    """
    DIGIBIB - read Digitale Bibliothek 5 volumes.

    Operations:
    - `list_volumes`  -> every installed CD-ROM volume: {id, title}.
    - `descriptor`    -> the volume's DIGIBIB.TXT identity keys.
    - `toc`           -> the table of contents as a nested tree (node index +
                         record index per node). Use max_depth to trim.
    - `node_text`     -> decoded text for a TOC node: the full chapter extent
                         (record..record_end, records_total, truncated flag).
    - `record_text`   -> decoded text for a raw TEXT.DKI record index.
    - `search`        -> full-text search over decoded text (needs query):
                         [{record, node_index, chapter, snippet}]. First search
                         per volume builds an FTS cache (~10 s), then instant.
    - `images`        -> figures at a zoom level (needs level or takes the
                         highest): {levels, level, images: [{name, width,
                         height, bpp, bytes, url}]}. Binary via the REST
                         image endpoint (see url per figure).

    NOTE: text decode is v2 (flowing paragraphs, heads dropped); output is
    readable but not yet byte-faithful.
    """
    lib = DigibibLibrary(root=root)
    op = (operation or "").lower()

    if op == "list_volumes":
        vols = lib.list_volumes()
        return {"success": True, "count": len(vols), "volumes": [{"id": v.id, "title": v.title} for v in vols]}

    if not volume_id:
        return {"success": False, "error": f"operation '{op}' needs volume_id."}
    try:
        vol = lib.open(volume_id)
    except KeyError as e:
        return {"success": False, "error": str(e)}

    if op == "descriptor":
        return {"success": True, "volume_id": volume_id, "title": vol.title, "descriptor": vol.descriptor}
    if op == "toc":
        return {
            "success": True,
            "volume_id": volume_id,
            "title": vol.title,
            "node_count": len(vol.toc_flat),
            "record_count": vol.record_count,
            "toc": [_toc_dict(r, max_depth) for r in vol.toc_tree()],
        }
    if op == "node_text":
        if node_index is None:
            return {"success": False, "error": "node_text needs node_index."}
        try:
            node = vol.toc_flat[node_index]
        except IndexError:
            return {"success": False, "error": f"node_index {node_index} out of range (0..{len(vol.toc_flat) - 1})."}
        start, end = vol.node_extent(node_index)
        if start is None or end is None:
            return {
                "success": True,
                "volume_id": volume_id,
                "node_index": node_index,
                "title": node.title,
                "record": None,
                "record_end": None,
                "records_total": 0,
                "truncated": False,
                "images": [],
                "text": "",
            }
        total = end - start
        return {
            "success": True,
            "volume_id": volume_id,
            "node_index": node_index,
            "title": node.title,
            "record": start,
            "record_end": end,
            "records_total": total,
            "truncated": total > MAX_NODE_RECORDS,
            "images": vol.node_image_refs(node_index),
            "image_levels": vol.image_levels(),
            "text": vol.node_text(node_index),
        }
    if op == "search":
        if not query or not query.strip():
            return {"success": False, "error": "search needs query."}
        hits = vol.search(query, limit or 20)
        return {
            "success": True,
            "volume_id": volume_id,
            "query": query,
            "count": len(hits),
            "results": hits,
        }
    if op == "images":
        levels = vol.image_levels()
        lv = level if level in levels else (max(levels) if levels else None)
        figs = vol.images(lv) if lv is not None else []
        for f in figs:
            f["url"] = f"/api/volume/{volume_id}/image/{lv}/{f['name']}"
        return {
            "success": True,
            "volume_id": volume_id,
            "levels": levels,
            "level": lv,
            "count": len(figs),
            "images": figs,
        }
    if op == "record_text":
        if record_index is None:
            return {"success": False, "error": "record_text needs record_index."}
        try:
            return {
                "success": True,
                "volume_id": volume_id,
                "record_index": record_index,
                "text": vol.record_text(record_index),
            }
        except IndexError as e:
            return {"success": False, "error": str(e)}

    return {
        "success": False,
        "error": f"Unknown operation '{operation}'. Valid: list_volumes, descriptor, toc, node_text, record_text, search, images.",
    }


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
