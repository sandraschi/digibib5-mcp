# Product Requirements Document — digibib5-mcp

**Status:** Active (`0.5.1` in development; `v0.5.0` MCPB released 2026-10-27)  
**Owner:** Sandra Schipal  
**Stack:** Python 3.12+ (FastMCP + Starlette + SQLite FTS5) · React 18 + Vite + Tailwind + Zustand (Bun)

---

## 1. Problem & Vision

Directmedia's **Digitale Bibliothek 5** series (1990s–2000s CD-ROMs) contains an extraordinary, largely forgotten scholarly corpus: the German literary and philosophical canon (*Killy Literaturlexikon*, *Wilpert*, *Deutsche Literatur von Luther bis Tucholsky*, Goethe, Lessing, Heine, Hoffmann, Kant, Nietzsche, Adorno), rare curiosities (*Merkwürdige Literatur*, *Handbuch des nutzlosen Wissens*), and English/American classics (*English and American Literature from Shakespeare to Mark Twain*, *Shakespeare: Complete Works*).

The original 32-bit Windows Digibib5 viewer is aging and isolated from modern workflows and AI assistants. `digibib5-mcp` reverse-engineers the proprietary `.DKI` / `TREE.DKA` / `IMAGES.LIB` format so anyone with their own discs can read, search, and query the collection natively on a modern PC and over MCP.

## 2. Target Users

- **Germanistik students, scholars, and humanities researchers** needing fast full-text search, chapter-level reading, and citation/record lookup across canonical German texts and reference lexica.
- **General readers & collectors** exploring rare or out-of-print editions on their own Digitale Bibliothek CD-ROMs/ISOs.
- **AI / MCP users** querying primary literary and philosophical sources directly from Claude, Cursor, or local LLMs.

## 3. Scope & Non-Goals

### In Scope
- Zero-dependency (no original Digibib5 binary required) `.DKI` volume discovery, `DIGIBIB.TXT` descriptor parsing, `TREE.DKI` + `TREE.DKA` TOC-to-record mapping, and v3 text decoding (including Cyrillic `DB006` `cp1251`/`ISO-8859-5` support and 2,000-record chapter views).
- Per-volume and cross-volume SQLite FTS5 full-text search (`data/search.db`).
- Embedded figure extraction (loose `IMAGES/1..4/*.BMP` and `IMAGES/images.lib` containers).
- Single `digibib` MCP portmanteau tool (`list_volumes`, `stats`, `descriptor`, `toc`, `node_text`, `record_text`, `search`, `images`).
- Starlette REST API (`127.0.0.1:14115`) and React/Vite reader webapp (`127.0.0.1:14114`).
- Curated CD-ROM catalog (`/catalog`) with summaries, categories, and availability status.
- First-time onboarding modal and persistent, testable Library Root configuration (`data/library.json`).

### Non-Goals
- Bundling copyrighted CD-ROM text or images (users supply their own discs/ISOs).
- Native `INDEX.*` / `LINKS.*` binary search-index parsing (replaced by decoded-text FTS5).
- Audio CD playback (`VORTRAG.DAT` / `hoffwNN.wav`).
- Byte-faithful print layout or heading/italics styling (text decode is readable flowing prose; style opcodes remain deferred).

## 4. Functional Requirements

| Area | Requirement | Status |
|------|-------------|--------|
| **Discovery & Config** | Scan `DIGIBIB_ROOT` (or `data/library.json` saved root) for `DB*` volumes; test & connect from UI without restart | Implemented |
| **Onboarding** | First-time modal explaining what the app is, where discs come from, and Library Root test/connect; re-runnable from Dashboard & Settings | Implemented |
| **Catalog** | Dedicated `/catalog` page with curated descriptions for all 76+ volumes, category/search filters, and Reader deep links | Implemented |
| **Reader** | Volume picker, nested TOC tree, full-chapter extent, raw record jump, per-volume & cross-volume search, `DIGIBIB.TXT` metadata panel, figure gallery | Implemented |
| **MCP & Tool Harness** | Live `/api/tools` + `/api/tools/{op}/run` with integer coercion matching `digibib` MCP portmanteau | Implemented |
| **LLM Chat** | Optional local (Ollama/LM Studio) or cloud LLM chat + onboarding | Implemented |
| **Mediacraft** | Future integration as a reading/library source in `(planned) mediacraft` | Planned (`docs/MEDIACRAFT.md`) |
