# Configuration

## Install root

Volumes live under one root, one folder per disc, each with a `data\` folder:

```
K:\Digitale Bibliothek\Bibliothek\DB008\data\TREE.DKI
```

| Setting | Default | Override |
|---------|---------|----------|
| Library root | `K:\Digitale Bibliothek\Bibliothek` | `DIGIBIB_ROOT` env var, `DigibibLibrary(root=...)`, MCP `root` arg, REST `?root=` query |
| REST backend port | `14115` | `DIGIBIB_API_PORT` env var |
| Reader frontend port | `14114` | `web_sota/start.ps1` (Vite) |

`DIGIBIB_ROOT` may point at the library root (scanned for `DB*` volumes).
A volume is recognised by a `data\` (any case) subfolder containing
`DIGIBIB.TXT`. Some discs (e.g. `DB012`) have no `TREE.DKA` - TOC nodes then
carry no record mapping and `node_text` returns empty (see TROUBLESHOOTING).

## Ports

| Service | Port | Notes |
|---------|------|-------|
| Vite reader frontend | 14114 | proxies `/api` to the backend |
| Starlette REST backend | 14115 | JSON only, no MCP-over-HTTP transport |
| MCP server | stdio | `uv run digibib5-mcp`, no port |

## Per-volume files (`data\`)

| File | Role | Status |
|------|------|--------|
| `DIGIBIB.TXT` | INI descriptor (`Caption`, `ShortTitle`, …) | read |
| `TREE.DKI` | TOC as CP1252 text, CRLF, leading spaces = depth | read |
| `TREE.DKA` | u32 node -> record table (see below) | read |
| `TEXT.DKI` | `[u32 count][u32 offset table][records]` (variant A) or `[u32 magic][offsets...]` (variant B, e.g. DB074) | read |
| `INDEX.*`, `LINKS.*` | search / cross-reference indexes | natively unread; search uses the FTS sidecar instead |
| `IMAGES\1..4\*.BMP` | figure scans at 4 zoom levels | read (served as `image/bmp`) |
| `SIGEL.DAT`, `VORTRAG.DAT`, `COVER*.BMP`, … | sigla, audio refs, cover art | audio not on discs (separate CDs); refs surface as text |

### `TREE.DKA` layout (solved 2026-10-26, verified DB003/004/005/007/008)

A structural prefix of large u32 values, then a monotonic non-decreasing run
of exactly N u32s (N = TOC line count) ending in `record_count + 1`
(terminator), then a short tail. Entry *i* maps to node *i+1* as
`record = entry - 1` (1-based); the volume root (node 0) starts at record 0.
Located by monotonic-run scan (`_find_table_start`), not by fixed offset -
the prefix length varies per volume (DB008: 27 u32s, DB004: 112).

### `TEXT.DKI` records

Each record: `[u16 length][header][#q:\…\hoff-NNN.txt|txi|txx marker][word-stream
body][trailing marker copy][0x03]`. Source-path markers use `.txt`, rarely
`.txi` / `.txx` - all matched as `.tx` + one alphanum. Record content is a
tokenized word stream (`<u8 len><cp1252 bytes>` words plus control opcodes),
see the codec map in DEVELOPMENT.md.

### Figures (`IMAGES\`)

Figure scans live in `IMAGES\1..4\*.BMP` - historically *next to* `data\` at
the volume root (DB008), though the format doc places them inside `data\`;
both locations are checked. Level 1 is thumbnail-size (DB008 `0092.BMP`:
100x79x8bpp, ~9 KB), level 4 near-full (969x768, ~750 KB). Not every figure
exists at every level (DB008: 53/53/53/48 - missing ones 404). File names
match the `NNNN.bmp` figure refs embedded in the text (opcode `0x0B` +
`[Abb. …]` captions); `node_image_refs()` collects them per chapter from the
raw records. Audio (`VORTRAG.DAT`, `hoffwNN.wav` refs) lives on separate audio
CDs, not the data discs.
