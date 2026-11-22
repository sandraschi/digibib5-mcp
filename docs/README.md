# digibib5-mcp docs

Reader clone for Directmedia's **Digitale Bibliothek 5** CD-ROM volumes,
built on a from-scratch reverse-engineering of the `.DKI` format.
MCP server + REST backend + React reader webapp.

An underrated treasure for Germanistik students, scholars, and curious readers:
the German canon (*Killy*, *Wilpert*, *Luther bis Tucholsky*, Goethe, Heine,
Hoffmann, Kant, Nietzsche, Adorno) alongside rare gems like *Merkwürdige
Literatur* (`DB111`) and English/American classics (`DB059`, `DB061`) — preserved
for modern offline reading and the (planned) [mediacraft](MEDIACRAFT.md) hub.

| Page | What |
|------|------|
| [CONFIGURATION.md](CONFIGURATION.md) | Install root, env vars, ports, per-volume file layout |
| [TOOLS.md](TOOLS.md) | MCP `digibib` operations, REST endpoints, Python library |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Repo layout, test/lint gates, codec v2 opcode map, release |
| [MEDIACRAFT.md](MEDIACRAFT.md) | Preliminary notes on the planned mediacraft integration |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Symptoms, causes, fixes |
| [Format reference](../README.md#format-in-brief) | One-table volume layout (README) |
| [Upstream reversing log](https://github.com/sandraschi/reversing-mcp/blob/master/docs/DIGIBIB5_DKI_FORMAT.md) | Ghidra findings, correction log, oracle notes |

Primary entry points: [README.md](../README.md), [INSTALL.md](../INSTALL.md),
[CHANGELOG_LATEST.md](../CHANGELOG_LATEST.md).
