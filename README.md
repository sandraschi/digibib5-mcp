# digibib5-mcp

A clone-in-progress of the **Digitale Bibliothek 5** reader (Directmedia /
Digitale Bibliothek), built on a from-scratch reverse-engineering of its `.DKI`
volume format. It reads the original CD-ROM images - volume list, table of
contents, and decoded text - and exposes them over MCP and REST, with a
reader webapp.

The `.DKI` format was reversed from the real discs (see
[reversing-mcp `docs/DIGIBIB5_DKI_FORMAT.md`](https://github.com/sandraschi/reversing-mcp/blob/master/docs/DIGIBIB5_DKI_FORMAT.md)).
Digibib5 itself is the oracle: run it alongside to compare rendered output.

## Documentation

| Doc | What |
|-----|------|
| [INSTALL.md](INSTALL.md) | setup, MCP config |
| [docs/ONBOARDING.md](docs/ONBOARDING.md) | first-timer guide: discs, costs (none), sanity check |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | env vars, ports, per-volume file layout |
| [docs/TOOLS.md](docs/TOOLS.md) | MCP ops, REST endpoints, Python library |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | repo layout, gates, codec map, release |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | symptoms and fixes |

## Status

Early. What works today:
- **Volume discovery** - scans the install root and lists every CD-ROM image.
- **Descriptor** - reads `DIGIBIB.TXT` identity (title etc.).
- **TOC** - parses `TREE.DKI` (indented-text tree) into a nested table of contents.
- **Text decode** - decodes `TEXT.DKI` records (tokenized word-stream codec, v2:
  flowing paragraphs, heads dropped, de-hyphenated).
- **Search** - FTS5 sidecar over decoded text with chapter snippets (`search` op,
  REST `/api/.../search`, reader search box).
- **Figures** - `IMAGES\` BMP scans served over REST with per-chapter figure
  strips in the reader (`images` op, `/api/.../images`, `/api/.../image/...`).
- **REST API + reader webapp** - a Starlette backend serves the library as JSON,
  and a React/Vite/Tailwind reader renders the volume picker, TOC tree, and text.

Known **v1 / approximate** (tracked, to refine against the Digibib5 oracle):
- The text codec's exact control-opcode grammar (heading levels, italics,
  links). Paragraph structure, running-head removal, de-hyphenation, spaced
  dashes, literal spans and reflowed line breaks are mapped (v2); output is
  flowing text but not yet byte-faithful.
- Images (`IMAGES\*.BMP` / `images.lib`) and the search indexes
  (`INDEX.*` / `LINKS.*`) are not wired up yet.

Solved 2026-10-26: the `TREE.DKA` node -> record mapping. The table is a
1-based start-record run for every node but the volume root (root starts at
record 0), located by monotonic-run scan. Clicking a TOC entry now renders the
whole chapter (all records until the next non-descendant node, capped at 100);
`node_text` reports `record` / `record_end` / `records_total` / `truncated`.

## Format, in brief

A volume is a `data\` folder:

| File | Role |
|------|------|
| `DIGIBIB.TXT` | INI descriptor (identity shown in the CD picker) |
| `TREE.DKI` | TOC as indented CP1252 text (leading spaces = depth) |
| `TREE.DKA` | u32 node -> record table (1-based run for all nodes but the root; see CONFIGURATION) |
| `TEXT.DKI` | `[u32 count][u32 offset table][records]`; each record length-prefixed, content is a tokenized word stream |
| `INDEX.*`, `LINKS.*` | search / cross-reference indexes (later) |
| `IMAGES\1..4\*.BMP` | page images at 4 zoom levels (later) |

## MCP tool

One portmanteau, `digibib`:

```
digibib(operation="list_volumes")
digibib(operation="descriptor", volume_id="DB008")
digibib(operation="toc", volume_id="DB008", max_depth=3)
digibib(operation="node_text", volume_id="DB008", node_index=5)
digibib(operation="record_text", volume_id="DB008", record_index=0)
digibib(operation="search", volume_id="DB008", query="Nathanael", limit=10)
digibib(operation="images", volume_id="DB008", level=1)
```

`node_text` returns the node's full chapter extent (`record`..`record_end`,
`records_total`, `truncated` when capped at 100 records) plus `images`
(figure names referenced by the chapter) and `image_levels`; `record_text`
reads one raw `TEXT.DKI` record; `search` returns FTS5 hits with the
containing chapter and a `«»`-marked snippet per hit.

The install root defaults to `K:\Digitale Bibliothek\Bibliothek` (override with
the `DIGIBIB_ROOT` env var or the `root` argument).

## Library

```python
from digibib5_mcp.dki import DigibibLibrary

lib = DigibibLibrary()
for ref in lib.list_volumes():
    print(ref.id, ref.title)

vol = lib.open("DB008")
print(vol.title)                 # Digitale Bibliothek Band 8: Hoffmann
for root in vol.toc_tree():
    print(root.title)            # Hoffmann -> ...
print(vol.record_text(0))        # decoded record text
```

## Run

```sh
uv run digibib5-mcp              # stdio MCP server
just api                         # REST backend only (Starlette on 14115)
just webapp                      # backend + Vite reader on http://127.0.0.1:14114
```

`just webapp` runs `web_sota/start.ps1`: it starts the backend, `bun install`s
the frontend on first run, then launches the Vite dev server. The frontend
proxies `/api` to the backend.

## Reader webapp

`web_sota/` - React 18 + Vite 6 + Tailwind 4 (Bun). Three panes: a CD-ROM volume
picker, a collapsible TOC tree, and a content pane rendering flowing chapter
text (book-like measure, justified serif). A "jump to #" record browser reads
`TEXT.DKI` records directly - handy for volumes without a `TREE.DKA` mapping
(e.g. DB012) and for inspecting raw records. Ports: 14114 (frontend) / 14115
(backend REST).

## Packaging

Fleet-standard: `justfile` (run / lint / test / release recipes), `mcpb.json` +
`manifest.json` for MCPB bundling (`just pack`), and `scripts/release.ps1` for
the triple-play release (mcpb + NSIS installer + GitHub release).

## Stack

Python 3.12+, FastMCP 3.2+, Pydantic v2, Starlette, uv. Frontend: React 18,
Vite 6, Tailwind 4, Bun.

## Legal

For reading Digitale Bibliothek volumes you own. Intended for interoperability,
preservation, and access on modern systems.

**Interoperability note (not legal advice).** This project contains no
copy-protection circumvention and redistributes no content from the discs:
no texts, no images, no audio, no keys - only code that reads CD-ROMs you
own. The `.DKI` container is an undocumented but unprotected format; nothing
here defeats an effective technical protection measure. Reverse-engineering
a file format to make lawfully acquired data usable on current systems is
the interoperability case the EU Software Directive (Art. 6) expressly
permits. "Digitale Bibliothek" is named only to describe compatibility.
If you are unsure in your jurisdiction, ask a lawyer before redistributing
anything beyond the code.
