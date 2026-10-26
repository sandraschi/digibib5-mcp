"""digibib5-mcp - read Digitale Bibliothek 5 CD-ROM volumes over MCP.

A clone-in-progress of the Digitale Bibliothek 5 reader. This server exposes the
reverse-engineered DKI library (volume discovery, TOC, decoded text) as one
`digibib` portmanteau tool. The reader webapp (UI) and the search indexes come
later; the text codec and TREE.DKA node mapping are v1/approximate (see
src/digibib5_mcp/dki and reversing-mcp/docs/DIGIBIB5_DKI_FORMAT.md).
"""

from __future__ import annotations

from typing import Annotated, Any

from fastmcp import FastMCP
from pydantic import Field

from .dki import DigibibLibrary

mcp = FastMCP("digibib5-mcp", version="0.1.0")


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
        Field(description="list_volumes | descriptor | toc | node_text | record_text"),
    ] = "list_volumes",
    volume_id: Annotated[
        str | None, Field(description="Volume folder id, e.g. 'DB008' (all ops except list_volumes).")
    ] = None,
    node_index: Annotated[int | None, Field(description="toc node index (node_text).")] = None,
    record_index: Annotated[int | None, Field(description="record index (record_text).")] = None,
    max_depth: Annotated[int | None, Field(description="toc: limit nesting depth.")] = None,
    root: Annotated[str | None, Field(description="Override the install root (default DIGIBIB_ROOT or K:\\...).")] = None,
) -> dict[str, Any]:
    """
    DIGIBIB - read Digitale Bibliothek 5 volumes.

    Operations:
    - `list_volumes`  -> every installed CD-ROM volume: {id, title}.
    - `descriptor`    -> the volume's DIGIBIB.TXT identity keys.
    - `toc`           -> the table of contents as a nested tree (node index +
                         record index per node). Use max_depth to trim.
    - `node_text`     -> decoded text for a TOC node (via its record).
    - `record_text`   -> decoded text for a raw TEXT.DKI record index.

    NOTE: text decode and the node->record mapping are v1/approximate; output is
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
            return {"success": False, "error": f"node_index {node_index} out of range (0..{len(vol.toc_flat)-1})."}
        return {"success": True, "volume_id": volume_id, "node_index": node_index,
                "title": node.title, "record": node.record, "text": vol.node_text(node_index)}
    if op == "record_text":
        if record_index is None:
            return {"success": False, "error": "record_text needs record_index."}
        try:
            return {"success": True, "volume_id": volume_id, "record_index": record_index,
                    "text": vol.record_text(record_index)}
        except IndexError as e:
            return {"success": False, "error": str(e)}

    return {"success": False, "error": f"Unknown operation '{operation}'. "
            "Valid: list_volumes, descriptor, toc, node_text, record_text."}


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
