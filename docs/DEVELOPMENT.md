# Development

## Layout

```
src/digibib5_mcp/
  dki/
    library.py   # DigibibLibrary: root scan, volume discovery
    volume.py    # DigibibVolume: descriptor, TOC, records, extents
    codec.py     # tokenized word-stream decoder (v2 grammar)
  server.py      # FastMCP stdio server, `digibib` portmanteau
  api.py         # Starlette REST backend (port 14115)
tests/test_dki.py  # synthetic codec tests + live-volume tests (skip w/o discs)
web_sota/          # React 18 + Vite 6 + Tailwind 4 reader (port 14114)
scripts/           # release.ps1 (triple-play), mcpb-pack.ps1, just/
```

## Gates

```sh
just gates-green   # ruff check + ruff format --check + pytest, all green
just test          # pytest tests/
just lint / just fix  # ruff (+ biome for web_sota via bunx)
```

`tests/test_dki.py` runs synthetic codec tests everywhere; live DB008 tests
skip automatically when no discs are mounted (`DIGIBIB_ROOT` absent), so CI
without the library still passes. Webapp typecheck:
`node_modules/.bin/tsc --noEmit` in `web_sota/` (repo-pinned TS 5.7 -
`bun x tsc` fetches TS 7 and misbehaves).

## Codec v2 opcode map (`codec.py`)

Pipeline: `_content_region` (strip `#q:` markers) -> `decode_tokens` ->
`render_text` (reflow + `postprocess_text` normalization).

| Byte(s) | Meaning | Render |
|---------|---------|--------|
| `<len><bytes>` printable | word, optional trailing inline punct | word, single-space joined |
| `0x00` | word terminator / stray | dropped |
| `0x01` (+ runs) | spacing/formatting | dropped |
| `0x02` single | soft print-layout break | space (reflow) |
| `0x02` run 2+ | paragraph break | blank line |
| `0x15` (+ break run) | paragraph marker | blank line |
| break + `00 04 01` | paragraph start | blank line |
| `0x13` + word | page running-head (`Hoffmann-PW Bd. N`, `rororo-*`) | dropped wherever it occurs |
| `0x08` / `00 08 00` | title/attribute frame ends | dropped |
| `0x04/05/06/07/0F/10` + operand | style attributes | dropped with operands |
| `0x0B` + word | cross-reference (`hoffwN` work link, `NNNN.bmp` figure) | reference word kept |
| `0x19 08 03 01` | body start after head | dropped (breaks remain) |
| `0x8B`/`0x9B` | transparent literal-group markers | markers dropped, printable run inside decoded as text |
| lone `0x2D` | spaced dash (Gedankenstrich) | `-` word |
| `word-` + break + lower | hyphenated line split | joined, hyphen dropped (`Hoff-\nmanns` -> `Hoffmanns`) |
| `word-` + break + Upper | true hyphen compound | joined, hyphen kept (`Serapions-\nBruder` -> `Serapions-Bruder`) |
| glued `«‹„"` at word start | opening quote | split off (`hoffw1«Meister` -> `hoffw1 «Meister`) |

`0x02` doubles as the length of 2-letter words (`E.`); the printable-chunk
check disambiguates. Open (evidence-thin, left dropped): `0x0E` block markers,
`0x0C` block ends, heading levels, italics, lone `0x84/0x94/0xAB/0xBB` bytes
(`0x94` verified as a `0x0F` operand).

## Search

`dki/search.py` builds a per-volume SQLite FTS5 sidecar at `data/search.db`
(`DIGIBIB_CACHE_DIR` overrides; invalidated by `TEXT.DKI` mtime+size).
Unicode61 tokenizer with diacritic folding, so `Hubner` finds `Hübner`;
raw FTS5 syntax, with an AND-of-terms fallback on syntax errors. Snippets via
`snippet()` with `«»` match markers. `node_for_record()` maps each hit to its
deepest chapter (extents precomputed once per volume, right-to-left stack
pass).

Deliberately not the native `INDEX.*`: searching decoded text guarantees hits
match exactly what the reader displays. Native format status (DB008):
`INDEX.TTX`/`LINKS.TTX` = `[count][per-record u32 offsets][data]` verified
(LINKS offs[-1] = PLX length; INDEX offs point into the TTX tail, not PLX -
pairing open), `LINKS.PLX` values are record numbers but the offset-to-record
alignment is unverified (record-3 slice does not point at the linked work),
`WLX` = word lexicon (entry framing open), `HTX`/`SHX`/`SWX` roles open
(`SWX` holds year/number terms, `INDEX.HTX`/`LINKS.HTX` are sparse/zeroed).

## Figures

`IMAGES/1..4/*.BMP` served as `image/bmp` (`parse_bmp_info` reads the
BITMAPINFOHEADER; traversal-guarded names). `vol.images()` lists a level,
`vol.image_bytes()` returns bytes, `node_image_refs()` regex-scans a
chapter's raw records for `NNNN.bmp` refs. Reader shows a thumbnail strip
(level 2, else first) linking to full size (highest level).

## Release

`just release` runs `scripts/release.ps1`: MCPB bundle (`just pack` ->
`dist/`, per `mcpb.json`) + NSIS installer + GitHub release.
`just release-dry` previews. Version bumps: `pyproject.toml`, `mcpb.json`,
`manifest.json`, `server.py` (`FastMCP(..., version=...)`) together.
