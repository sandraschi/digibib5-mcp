# digibib5-mcp - latest changes

## 0.1.2 (2026-10-26) - codec v2: flowing text

Chapters rendered as ~64-char ragged print lines (every soft `0x02` break
preserved). The codec now reflows: single breaks become spaces, `0x15`-led /
multi-`0x02` / `04`-led breaks become paragraphs. Also: page running-heads
(`0x13`-introduced `Hoffmann-PW Bd. N` / `rororo-*`, ~5.9k per volume) dropped
everywhere; line-split hyphenation re-joined (~38k in DB008, uppercase keeps
its hyphen); lone `0x2D` kept as spaced dash; `8B`/`9B` literal spans rescued
(italic/literal words were silently dropped); glued opening quotes split
(`hoffw1«Meister` -> `hoffw1 «Meister`); cross-record hyphen/dash joins.
`render_text` output is flowing paragraphs; `node_text` joins records with a
soft break and post-processes the whole chapter. Reader webapp: book-like
measure (68ch), justified serif body with automatic German hyphenation.
Open: 0x0E block markers, 0x0C block ends, heading levels, italics.

## 0.1.1 (2026-10-26) - TREE.DKA mapping solved

TOC clicks rendered the wrong chapter: `_load_toc` read the LAST N u32s of
TREE.DKA as the node table, but the real table sits mid-file (structural prefix
before it, tail data after). It is a 1-based start-record run for every node
but the volume root (monotonic, ending in record-count + 1, verified across
DB003/004/005/007/008), with `record = entry - 1` and root at record 0.
`node_text` now returns the node's full chapter extent (until the next
non-descendant node, capped at 100 records / 300k chars) with `record_end` /
`records_total` / `truncated` metadata, and the reader webapp shows the record
range. Also fixed: `.txi` / `.txx` source-path markers leaked into decoded text
(marker regex is now `.tx` + one alphanum).

## 0.1.0 (2026-10-26) - initial stand-up

First scaffold of the Digitale Bibliothek 5 reader clone, seeded with the
reverse-engineered DKI format library.

- `dki` library:
  - `DigibibLibrary` - scans the install root (default
    `K:\Digitale Bibliothek\Bibliothek`, override via `DIGIBIB_ROOT`) and lists
    every CD-ROM volume. Verified: 76 volumes discovered with real titles.
  - `DigibibVolume` - reads `DIGIBIB.TXT` identity, `TREE.DKI` TOC (indented
    text -> nested tree), `TEXT.DKI` records, and decodes record text.
  - `codec` - the tokenized word-stream text decoder (v1/approximate).
- `digibib` MCP portmanteau: list_volumes, descriptor, toc, node_text,
  record_text.
- REST backend (`digibib5_mcp.api`, Starlette on 14115): `/api/volumes`,
  `/api/volume/{id}/{descriptor,toc}`, `/api/volume/{id}/node/{i}/text`,
  `/api/volume/{id}/record/{i}/text`. Verified live against the real discs
  (76 volumes; DB008 = 158 TOC nodes, 5974 records).
- Reader webapp (`web_sota/`, React 18 + Vite 6 + Tailwind 4, Bun): volume
  picker, collapsible TOC tree, content pane, and a direct record browser
  ("jump to #") that works around the approximate node->record mapping.
  Frontend on 14114, proxies `/api` -> 14115. Production build verified.
- Fleet packaging: `justfile` (fleet recipes), `mcpb.json` + `manifest.json`
  for MCPB bundling, `scripts/release.ps1` (triple-play), LICENSE (MIT).
  Registered in the Claude Desktop config, FLEET_INDEX, and WEBAPP_PORTS
  (14114/14115).

Deferred (refine later): exact codec control-opcode grammar, TREE.DKA
node->record mapping, images, search indexes.

Format reference: reversing-mcp `docs/DIGIBIB5_DKI_FORMAT.md`.
