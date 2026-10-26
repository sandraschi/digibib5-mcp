# Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `list_volumes` returns `[]` | `DIGIBIB_ROOT` wrong or discs not mounted | Check `K:\Digitale Bibliothek\Bibliothek` exists; pass `root=` / `?root=` / `DIGIBIB_ROOT` |
| `node_text` returns `""` for every node | Volume has no `TREE.DKA` (e.g. DB012) - nothing maps nodes to records | Use `record_text` / "jump to #" browser for that volume |
| Chapter text looks like the wrong chapter | Stale checkout (pre-0.1.1 `tail -N` DKA slice) | Pull latest; mapping is solved, verify `record` matches the TOC entry's start |
| Page headers (`Hoffmann-PW Bd. N`) inside chapter text | Stale checkout (pre-0.1.2 codec) | Pull latest; `0x13` heads are dropped |
| Words split mid-syllable (`Hoff- manns`) | Stale checkout (pre-0.1.2 de-hyphenation) | Pull latest |
| Reader shows "No table of contents" | No volume selected, or volume lacks `TREE.DKI` | Pick a volume; check the `data\` folder |
| Reader content pane empty for a node | Volume without `.DKA` (see above) | Use "jump to #" with a record number |
| `just webapp` fails on `bun install` | Bun missing or offline registry | Install Bun (`irm bun.sh/install.ps1 \| iex` equivalent for Windows via `bun` docs); backend alone runs with `just api` |
| Port 14114/14115 already in use | Stale backend/Vite process | `stop.bat` at repo root, or kill the owning process and retry |
| `ruff`/`pytest` not found | Dev/test extras not synced | `uv sync --extra dev --extra test` (note: `--group dev` is not defined; extras are `dev` and `test`) |
| `biome ci` flags `useButtonType` / non-null assertions | Pre-existing webapp lint debt, unrelated to content changes | Leave alone or fix separately; `just lint` exits 0 by design |
| First `search` on a volume is slow (~10 s) | FTS cache builds by decoding all records | Expected once per volume; cached in `data/search.db`, invalidated by `TEXT.DKI` mtime+size |
| `search` FTS5 syntax error | Unbalanced quotes etc. in `?q=` | Server falls back to AND-of-terms; quote phrases explicitly: `?q="Der Sandmann"` |
| Figure 404 in reader (full size) | Not every figure exists at the highest zoom (DB008 L4: 48/53) | Thumbnails use a lower level; missing full-size 404s are expected |
| Mojibake/`�` in terminal output | Console font/encoding mangling high-CP1252 chars (ö, ü, «), not decoder output | Decoded text contains zero U+FFFD; check in the webapp or a UTF-8 file |
