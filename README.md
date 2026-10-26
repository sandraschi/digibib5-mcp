# digibib5-mcp

A clone-in-progress of the **Digitale Bibliothek 5** reader (Directmedia /
Digitale Bibliothek), built on a from-scratch reverse-engineering of its `.DKI`
volume format. It reads the original CD-ROM images - volume list, table of
contents, and decoded text - and exposes them over MCP, with a reader webapp to
follow.

The `.DKI` format was reversed from the real discs (see
[reversing-mcp `docs/DIGIBIB5_DKI_FORMAT.md`](https://github.com/sandraschi/reversing-mcp/blob/master/docs/DIGIBIB5_DKI_FORMAT.md)).
Digibib5 itself is the oracle: run it alongside to compare rendered output.

## Status

Early. What works today:
- **Volume discovery** - scans the install root and lists every CD-ROM image.
- **Descriptor** - reads `DIGIBIB.TXT` identity (title etc.).
- **TOC** - parses `TREE.DKI` (indented-text tree) into a nested table of contents.
- **Text decode** - decodes `TEXT.DKI` records (tokenized word-stream codec).
- **REST API + reader webapp** - a Starlette backend serves the library as JSON,
  and a React/Vite/Tailwind reader renders the volume picker, TOC tree, and text.

Known **v1 / approximate** (tracked, to refine against the Digibib5 oracle):
- The text codec's exact control-opcode grammar (spacing, headings, italics,
  links). Output is readable but not yet byte-faithful.
- The `TREE.DKA` node -> record mapping (currently a heuristic slice).
- Images (`IMAGES\*.BMP` / `images.lib`) and the search indexes
  (`INDEX.*` / `LINKS.*`) are not wired up yet.

## Format, in brief

A volume is a `data\` folder:

| File | Role |
|------|------|
| `DIGIBIB.TXT` | INI descriptor (identity shown in the CD picker) |
| `TREE.DKI` | TOC as indented CP1252 text (leading spaces = depth) |
| `TREE.DKA` | u32 table mapping each TOC node to a record index |
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
```

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
picker, a collapsible TOC tree, and a content pane. A "jump to #" record browser
reads `TEXT.DKI` records directly, which is handy while the `TREE.DKA`
node -> record mapping is still approximate. Ports: 14114 (frontend) / 14115
(backend REST + MCP HTTP).

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
