# Mediacraft Integration (Preliminary / Planned)

> **Status:** Preliminary / planned — `mediacraft` is not yet an active repository on disk. This document captures the intended role of `digibib5-mcp` once `mediacraft` is created.

## Overview

**mediacraft** is planned as a unified media and library hub bringing together personal reading, archive, and media collections. Within that ecosystem, `digibib5-mcp` serves as the dedicated **Digitale Bibliothek 5** (`.DKI`) backend and reader module.

## Intended Integration Boundary

- **Standalone engine:** `digibib5-mcp` remains an independent FastMCP server and Starlette REST backend (`127.0.0.1:14115`), owning `.DKI` decoding, `TREE.DKA` chapter mapping, SQLite FTS5 indexing (`data/search.db`), and figure extraction.
- **Mediacraft surface:** `mediacraft` will consume `digibib5-mcp` over its REST endpoints (`/api/catalog`, `/api/volumes`, `/api/search`, `/api/volume/{vid}/...`) or via the `digibib` MCP portmanteau tool.
- **Service hosting:** Process supervision and reverse-proxying (e.g. via `myhomeserver` or a future `homeservercraft`) stay separate from the reader/catalog logic.
