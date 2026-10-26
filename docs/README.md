# digibib5-mcp docs

Reader clone for Directmedia's **Digitale Bibliothek 5** CD-ROM volumes,
built on a from-scratch reverse-engineering of the `.DKI` format.
MCP server + REST backend + React reader webapp.

| Page | What |
|------|------|
| [CONFIGURATION.md](CONFIGURATION.md) | Install root, env vars, ports, per-volume file layout |
| [TOOLS.md](TOOLS.md) | MCP `digibib` operations, REST endpoints, Python library |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Repo layout, test/lint gates, codec v2 opcode map, release |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Symptoms, causes, fixes |
| [Format reference](../README.md#format-in-brief) | One-table volume layout (README) |
| [Upstream reversing log](https://github.com/sandraschi/reversing-mcp/blob/master/docs/DIGIBIB5_DKI_FORMAT.md) | Ghidra findings, correction log, oracle notes |

Primary entry points: [README.md](../README.md), [INSTALL.md](../INSTALL.md),
[CHANGELOG_LATEST.md](../CHANGELOG_LATEST.md).
