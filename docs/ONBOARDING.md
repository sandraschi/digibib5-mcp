# Onboarding — digibib5-mcp

## What this is for

Readers who own Digitale Bibliothek CD-ROMs and want them usable on a modern
PC: browse the table of contents, read flowing decoded chapters, full-text
search with chapter context, and view the embedded figures. It does not
reproduce the original Digibib5 program (no search-index import, no audio
playback, no print layout) and it contains no book content itself — you bring
the discs.

## Cost and accounts (money / CC)

| Question | Answer |
|----------|--------|
| Do I need an account? | No |
| Free tier? | Yes — everything is local and free |
| Credit card required? | No |
| Ongoing cost? | None (optional cloud LLM keys for the reader chat are yours, see Settings) |
| Who bills? | Nobody |

## Prerequisites outside this repo

- The Digitale Bibliothek disc images, mounted or copied to a local folder
  (e.g. `K:\Digitale Bibliothek\Bibliothek` with `DB008\data\...` inside).
- Python 3.12+ via `uv`, Bun (reader webapp only) — both in INSTALL.md.
- Optional: a local LLM (Ollama/LM Studio) for the reader chat page.

## First-timer setup steps

1. Point the library at your discs: set `DIGIBIB_ROOT` (or pass `root=` /
   `?root=` per call) to the folder containing the `DB*` volumes.
2. `uv sync --extra dev --extra test`, then `just gates-green` (ruff + pytest).
3. `just webapp` — backend on 14115, reader on http://127.0.0.1:14114.
4. Pick a volume in the reader. Chapters, search, and figures should all work.

## Pitfalls

- **Wrong root, empty library.** The picker shows every `DB*` folder with a
  `data\DIGIBIB.TXT`. Point at the *library* folder, not a single volume.
- **DB012-style volumes have no `TREE.DKA`.** Chapters resolve to empty text;
  use the record browser ("jump to #") instead. Not a bug.
- **First search takes ~10 s per volume.** The FTS cache builds by decoding
  everything once, then lives in `data/search.db`.
- **Figure 404s at full zoom.** Level 4 lacks 5 of DB008's 53 figures; the
  strip uses a lower level automatically.
- **Audiobook refs are dead ends.** `hoffwNN.wav` / `VORTRAG.DAT` point at
  separate audio CDs, which this reader does not play (yet).

## Sanity check

- `GET /api/health` returns `{"root_exists": true}`.
- Reader Dashboard shows your disc count (not the MOCK badge).
- `digibib(operation="node_text", volume_id="DB008", node_index=87)` returns
  the *Der Sandmann* chapter starting with "Nathanael an Lothar".

## Declared doubles

- Without discs mounted: empty volume list, empty TOC, honestly empty states —
  no fake books, no sample chapters. The MOCK badge appears only on the
  Dashboard sample KPIs until a real library is detected (see `mockOnboarding`).
