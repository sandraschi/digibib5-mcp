# BUILD_LOG — digibib5-mcp release builds

Running record for every build/packaging attempt: what was run, what failed,
what fixed it. Newest first.

## 2026-10-27 — MCPB release prep (v0.5.0, no tag yet)

**Scope:** MCPB bundle + GitHub-release path only. No NSIS: the repo has no
`src-tauri/`, no `native/build.ps1`, no PyInstaller spec — the Tauri track
needs its own scaffold + full TAURI_PRODUCTION_PITFALLS Phase 1 audit
(sections A–J) before any installer work starts. `just release` is wired
with `-SkipNsis` until then; `-SkipSidecar` is implied (smoke needs the
Tauri sidecar exe).

**Done:**
- `assets/prompts/{system.md,user.md,examples.json}` written to the 3-4-100
  gate: system 3090 words, user 4025 words, 110 examples. Verified with the
  gate snippet (`-split '\s+'` word count + `ConvertFrom-Json` count).
- `mcpb.json`: added missing `httpx` runtime dep, added `assets/**/*` to
  `build.include`.
- `scripts/release.ps1`: per-repo block configured for digibib5
  (port 14115, smoke route `/api/volumes`, digibib5 exe names,
  `NativeBuildScript`/`TauriStartsScript` emptied = NSIS explicitly off).
  Fixed template bugs found while reading it: `mcpb validate $mcpbOut`
  can never work (validate takes a manifest, not a bundle) — replaced with
  `mcpb info $mcpbOut`; winrar leftovers renamed.
- `scripts/mcpb-pack.ps1`: `npx` → `bunx` (repo standard is bun).
- `just pack`: fixed missing repo-dir argument (was packing `.` with an
  empty out path).
- 3-4-100 gate: PASS (3090 / 4025 / 110).
- `just pack`: PASS — `dist/digibib5-mcp-v0.5.0.mcpb`, 175.1 kB, 37 files,
  51 ignored. `manifest.json` validates (`manifest schema validation
  passes`). Unpacked bundle inspected: `src/`, `assets/prompts/*`,
  `manifest.json`, README/LICENSE all present; no `.venv`/`node_modules`/
  `data/` leakage.
- `just ci`: green before and after (ruff, format, pyright 0 errors,
  pytest 37 passed). Webapp: `tsc --noEmit` clean, `biome ci` clean,
  `vite build` succeeds (421 kB JS, 134 kB gzip).

**Not yet run:** `just release -DryRun` (needs a clean tree; blocked while
other work is uncommitted) and the real tagged release. Next release steps:
1) commit everything, 2) `just release -DryRun`, 3) `just release -SkipNsis`
   (tags vX.Y.Z, creates the GitHub release, uploads the .mcpb).

**Known packaging gaps (not blockers for an MCPB-only release):**
- No `assets/icon.png` (store listing shows a default icon).
- Bundle is unsigned (`mcpb info` reports `WARNING: Not signed`) — expected
  without a signing cert; document at release time, do not block on it.
- `uv.lock` ships inside the bundle (harmless, pins deps; leave it).
