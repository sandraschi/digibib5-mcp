# Contributing to digibib5-mcp

Small fleet repo, one maintainer plus collaborators, zero patience for process theatre. These rules exist so your contribution gets merged instead of stalled.

## Issues first

- **Search before you file.** Duplicates get closed.
- **One issue, one request.** Two features = two issues.
- **Bug reports need the reproducer**: volume id + TOC node or record index (or MCP op + args) plus the exact wrong text or error. Screenshots of the reader help; always note the volume (e.g. DB008).
- **Feature requests need a use case**: which discs, what reading workflow, what is missing?

## Pull requests

- **File the issue first** (unless it's a trivial fix: typo, broken link, lint). The issue is where scope gets agreed before code exists.
- **Keep diffs small.** One concern per PR (max ~5 files — fleet batch rule).
- **Tests required.** New decoder behavior without a synthetic codec test is a draft, not a PR. Run `uv run pytest` before pushing (live-volume tests skip automatically without the discs; never require mounted discs in CI).
- **Lint green:** `ruff check src tests`, `ruff format --check`, `uv run pyright src/`; reader touched? local `tsc --noEmit` in `web_sota/` plus `biome ci`.
- **The maintainer merges.** Don't merge your own PR.

## DKI rules: the hard parts

- **Evidence before grammar.** Codec changes need byte-level proof (control n-grams, headed-record spot checks across volumes) — see `docs/DEVELOPMENT.md` codec map. No speculative opcode assignments.
- **Text fidelity first.** Search indexes decoded text, so a decode regression silently corrupts search. Keep `render_text` output stable; extend tests, don't reshape them.
- **Never invent record mappings.** TREE.DKA layout claims must verify against headed records on at least two volumes.
- **No disc content in the repo.** Decoded text samples in tests stay synthetic and tiny. No BMPs, no full chapters, no audio.

## What this repo never does

- **No live network calls in tests.** Everything is local disc data or synthetic fixtures.
- **No hardcoded API keys or emails**, in code or examples.
- **No invented decode output.** A failed decode is an error or empty string, never plausible-looking text.
