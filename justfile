set windows-shell := ["powershell.exe", "-NoProfile", "-Command"]
import 'scripts/just/fleet.just'

# --- Dashboard ---

# List available recipes
default:
    @just --list

# --- Runtime ---

# Start the Digibib5 MCP Server (stdio transport)
server:
    Set-Location '{{justfile_directory()}}'
    uv run python -m digibib5_mcp

# Start the SOTA reader webapp (Frontend: 14114, Backend: 14115)
webapp:
    Set-Location '{{justfile_directory()}}'
    powershell.exe -ExecutionPolicy Bypass -File ./web_sota/start.ps1

# Start only the Starlette backend (REST on 14115)
api:
    Set-Location '{{justfile_directory()}}'
    uv run python -m digibib5_mcp.api

# --- Quality ---

# Execute Ruff + Biome linting
lint:
    Set-Location '{{justfile_directory()}}'; uv run ruff check .; Set-Location '{{justfile_directory()}}\web_sota'; bunx @biomejs/biome ci . 2>$null; exit 0

# Execute Ruff + Biome fix and formatting
fix:
    Set-Location '{{justfile_directory()}}'; uv run ruff check . --fix --unsafe-fixes; uv run ruff format .; Set-Location '{{justfile_directory()}}\web_sota'; bunx @biomejs/biome check --write . 2>$null; exit 0

# --- Release ---

# Build mcpb + NSIS installer + upload GitHub release (triple-play).
# NOTE: Tauri/NSIS scaffold does not exist yet (no src-tauri/, no native/
# build script), so releases run MCPB + GitHub only. Full triple-play unlocks
# once the Tauri track is scaffolded and audited per TAURI_PRODUCTION_PITFALLS.
release:
    powershell.exe -NoProfile -File "{{justfile_directory()}}/scripts/release.ps1" -SkipNsis

# Dry-run the release pipeline without building or uploading anything
release-dry:
    powershell.exe -NoProfile -File "{{justfile_directory()}}/scripts/release.ps1" -DryRun

# Build only the mcpb bundle into dist/
pack:
    powershell.exe -NoProfile -File "{{justfile_directory()}}/scripts/mcpb-pack.ps1" "{{justfile_directory()}}"

# --- Gates ---

# Local CI mirror (same checks as .github/workflows/ci.yml)
ci:
    Set-Location '{{justfile_directory()}}'
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/Test-Ps51Parse.ps1 -Path .
    uv run ruff check src/ tests/
    uv run ruff format src/ tests/ --check
    uv run pyright src/
    uv run pytest tests/ -q --tb=short

# Lint + format check + tests, all green or report exactly what failed
gates-green:
    Set-Location '{{justfile_directory()}}'
    uv run ruff check src/ --quiet
    uv run ruff format src/ --check --quiet
    uv run pytest tests/ -q

# --- Testing ---

# Execute all unit tests via pytest
test:
    Set-Location '{{justfile_directory()}}'
    uv run pytest tests/

# Execute tests with coverage reporting and HTML output
test-cov:
    Set-Location '{{justfile_directory()}}'
    uv run pytest --cov=src/digibib5_mcp --cov-report=term-missing --cov-report=html tests/

# Rerun only failed tests from the last run
test-failed:
    Set-Location '{{justfile_directory()}}'
    uv run pytest --lf tests/

# Bootstrap: install dev deps
bootstrap:
    uv sync --extra dev --extra test
    Write-Host "Dev environment ready." -ForegroundColor Green
