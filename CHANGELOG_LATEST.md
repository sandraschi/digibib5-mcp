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

Deferred (refine later): exact codec control-opcode grammar, TREE.DKA
node->record mapping, images, search indexes, reader webapp.

Format reference: reversing-mcp `docs/DIGIBIB5_DKI_FORMAT.md`.
