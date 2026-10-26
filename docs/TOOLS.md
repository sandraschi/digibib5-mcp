# Tools

One MCP portmanteau, one REST surface, one Python library - all three expose
the same reverse-engineered DKI layer.

## MCP: `digibib`

Stdio server (`uv run digibib5-mcp`). Every op takes optional `root` to
override `DIGIBIB_ROOT`.

| `operation` | Args | Returns |
|-------------|------|---------|
| `list_volumes` | - | `{volumes: [{id, title}], count}` |
| `descriptor` | `volume_id` | `{title, descriptor}` (DIGIBIB.TXT keys) |
| `toc` | `volume_id`, `max_depth?` | nested `{index, title, depth, record, children?}` forest + `node_count`, `record_count` |
| `node_text` | `volume_id`, `node_index` | full chapter extent: `{title, record, record_end, records_total, truncated, text}` |
| `record_text` | `volume_id`, `record_index` | single raw record: `{text}` |

`node_text` concatenates every record from the node's start record up to the
next non-descendant node (capped at 100 records / 300k chars, `truncated: true`
when capped). Extent metadata uses half-open `[record, record_end)`.

## REST (`http://127.0.0.1:14115`)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/health` | `{root, root_exists}` |
| GET | `/api/volumes` | volume list |
| GET | `/api/volume/{vid}/descriptor` | |
| GET | `/api/volume/{vid}/toc?max_depth=` | |
| GET | `/api/volume/{vid}/node/{idx}/text` | chapter extent + metadata |
| GET | `/api/volume/{vid)/record/{idx}/text` | single record |

All endpoints accept `?root=` to override the library root. The Vite reader
(14114) proxies `/api` here.

## Python library

```python
from digibib5_mcp.dki import DigibibLibrary

lib = DigibibLibrary()                     # DigibibLibrary(root=...) override
lib.list_volumes()                         # [VolumeRef(id, data_dir, title)]
vol = lib.open("DB008")
vol.title                                  # from DIGIBIB.TXT Caption
vol.descriptor                             # dict of INI keys
vol.toc_flat                               # [TocNode(index, depth, title, record, children)]
vol.toc_tree()                             # nested forest
vol.record_count
vol.record_text(i)                         # decoded single record
vol.node_extent(i)                         # (start, end) half-open record range
vol.node_text(i, max_records=100)          # decoded chapter
```

`TocNode.record` is the chapter's start record from `TREE.DKA` (`None` when
the volume has no `.DKA`, e.g. DB012). `MAX_NODE_RECORDS = 100`,
`MAX_NODE_CHARS = 300_000`.
