# digibib5-mcp - latest changes

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
