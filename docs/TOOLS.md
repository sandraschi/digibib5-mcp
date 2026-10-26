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
| `search` | `volume_id`, `query`, `limit?` | FTS5 hits: `[{record, node_index, chapter, snippet}]` |
| `images` | `volume_id`, `level?` | figures: `{levels, level, images: [{name, width, height, bpp, bytes, level, url}]}` |

`node_text` concatenates every record from the node's start record up to the
next non-descendant node (capped at 100 records / 300k chars, `truncated: true`
when capped). Extent metadata is half-open `[record, record_end)`. `search`
queries decoded text with FTS5 syntax (words, `AND`/`OR`/`NOT`, `"phrase"`,
`prefix*`); snippets mark matches with `«»`. First search per volume builds
the cache (~10 s for DB008), later searches are instant. `images` lists
figures at a zoom level (default: highest); binary bytes come from the
`image/{level}/{name}` REST endpoint (`url` per figure).

## REST (`http://127.0.0.1:14115`)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/health` | `{root, root_exists}` |
| GET | `/api/volumes` | volume list |
| GET | `/api/volume/{vid}/descriptor` | |
| GET | `/api/volume/{vid}/toc?max_depth=` | |
| GET | `/api/volume/{vid}/node/{idx}/text` | chapter extent + metadata |
| GET | `/api/volume/{vid)/record/{idx}/text` | single record |
| GET | `/api/volume/{vid}/search?q=&limit=` | FTS5 hits: `{query, count, results}` |
| GET | `/api/volume/{vid}/images?level=` | figures: `{levels, level, count, images}` |
| GET | `/api/volume/{vid}/image/{level}/{name}` | raw BMP bytes (`image/bmp`) |
| GET | `/api/stats` | `{volumes, total_records, total_figures, index_bytes}` |
| GET | `/api/logs?limit=` | ring-buffer log entries |
| GET | `/api/tools` | live tool schemas derived from the `digibib` function |
| GET | `/api/tools/{op}` | one operation's schema |
| POST | `/api/tools/{op}/run` `{arguments}` | invoke an operation, `{result}` |
| GET | `/api/llm/providers` | local/cloud registry + detection, never key bytes |
| GET | `/api/llm/models?provider=` | live list or curated-with-`key_missing` |
| POST | `/api/llm/test` `{provider, api_key?}` | validate without saving |
| GET/POST | `/api/settings/llm` | backend truth: active pair; save selects + switches VRAM |
| DELETE | `/api/settings/llm/key?provider=` | forget a stored key |
| POST | `/api/llm/chat` | non-streaming completion, `{content}` |
| POST | `/api/llm/chat/stream` | SSE OpenAI-style chunks |
| GET | `/api/llm/gpus` | nvidia-smi VRAM per card |
| GET | `/api/llm/loaded?provider=` | resident models (Ollama `/api/ps`) |
| POST | `/api/llm/unload` | evict all residents on an engine |
| GET | `/api/llm/onboarding` | locals, configured clouds, recommended path |
| POST | `/api/llm/install` | allowlisted one-click engine install (Ollama) |
| GET | `/api/llm/install/status` | background install state |

All endpoints accept `?root=` to override the library root. The Vite reader
(14114) proxies `/api` here.

## Python library

```python
from digibib5_mcp.dki import DigibibLibrary

lib = DigibibLibrary()  # DigibibLibrary(root=...) override
lib.list_volumes()  # [VolumeRef(id, data_dir, title)]
vol = lib.open("DB008")
vol.title  # from DIGIBIB.TXT Caption
vol.descriptor  # dict of INI keys
vol.toc_flat  # [TocNode(index, depth, title, record, children)]
vol.toc_tree()  # nested forest
vol.record_count
vol.record_text(i)  # decoded single record
vol.node_extent(i)  # (start, end) half-open record range
vol.node_text(i, max_records=100)  # decoded chapter
vol.node_for_record(r)  # deepest TocNode containing record r
vol.search("Nathanael", limit=20)  # [{record, node_index, chapter, snippet}]
vol.image_levels()  # e.g. [1, 2, 3, 4]
vol.images(level=None)  # [{name, width, height, bpp, bytes, level}] (level = served zoom)
vol.image_bytes(level, name)  # raw BMP bytes
vol.node_image_refs(i)  # figure names referenced by chapter i
```

`TocNode.record` is the chapter's start record from `TREE.DKA` (`None` when
the volume has no `.DKA`, e.g. DB012). `MAX_NODE_RECORDS = 100`,
`MAX_NODE_CHARS = 300_000`.
