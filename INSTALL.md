# Install

For reading Digitale Bibliothek volumes you own (interoperability, preservation).

## Prerequisites

- Windows + PowerShell 7
- Python 3.12+ with [uv](https://docs.astral.sh/uv/)
- The disc images, e.g. `K:\Digitale Bibliothek\Bibliothek\DB008\data\`
  (or set `DIGIBIB_ROOT` to your library root)
- Bun (reader webapp only): https://bun.sh

## Backend + MCP server

```powershell
cd D:\Dev\repos\digibib5-mcp
uv sync --extra dev --extra test
just gates-green   # ruff + pytest, all green
just api           # REST backend on http://127.0.0.1:14115
```

Stdio MCP server: `uv run digibib5-mcp`.

## Reader webapp

```powershell
just webapp        # backend + Vite reader on http://127.0.0.1:14114
```

First run does `bun install` in `web_sota/`. `start.ps1` / `start.bat` at the
repo root launch the same stack; `stop.bat` stops it.

## Claude Desktop (MCP)

```json
{
  "mcpServers": {
    "digibib5-mcp": {
      "command": "uv",
      "args": ["run", "--directory", "D:/Dev/repos/digibib5-mcp",
               "python", "-m", "digibib5_mcp"],
      "env": {
        "PYTHONPATH": "D:/Dev/repos/digibib5-mcp/src",
        "DIGIBIB_ROOT": "K:/Digitale Bibliothek/Bibliothek"
      }
    }
  }
}
```

(No API key, no network - everything is local. Volumes without `TREE.DKA`,
e.g. DB012, expose TOC without chapter text; see `docs/TROUBLESHOOTING.md`.)
