"""DigibibVolume - open a Digitale Bibliothek 5 CD-ROM image and read it.

A volume is a ``data\\`` folder containing:
- ``DIGIBIB.TXT``  - INI descriptor (identity shown in the CD picker).
- ``TREE.DKI``     - TOC as indented CP1252 text (leading spaces = depth).
- ``TREE.DKA``     - u32 table mapping each TOC line to a TEXT.DKI record index.
- ``TEXT.DKI``     - ``[u32 count][u32 offset table][records]``; each record is
                     length-prefixed, bracketed by its ``#q:\\...txt`` source path.

See reversing-mcp/docs/DIGIBIB5_DKI_FORMAT.md for the full format write-up.
The text decode is v1/approximate (see codec.py).
"""

from __future__ import annotations

import re
import struct
from dataclasses import dataclass, field
from pathlib import Path

from .codec import decode_record_content, postprocess_text

CP = "cp1252"

# Source-path marker in TEXT.DKI records, e.g. ``#q:\digibib\8hoff\texte\hoff-200.txt``.
# Extension is usually ``.txt`` but ``.txi`` / ``.txx`` occur (DB008 records).
_MARKER = re.compile(rb"#q:[^ \r\n]{0,90}?\.tx[A-Za-z0-9]")
# A marker counts as the LEADING (header) marker only this close to the record start.
_HEADER_ZONE = 128

# node_text safety caps: a chapter extent can span 60+ records (Sandmann ~60);
# the volume root spans all records, so it must be truncated.
MAX_NODE_RECORDS = 100
MAX_NODE_CHARS = 300_000


@dataclass
class TocNode:
    index: int  # line index in TREE.DKI
    depth: int  # indentation depth
    title: str
    record: int | None  # record index into TEXT.DKI (from TREE.DKA), if known
    children: list[TocNode] = field(default_factory=list)


class DigibibVolume:
    """Lazily reads a Digibib volume's data folder."""

    def __init__(self, data_dir: str | Path):
        self.data_dir = Path(data_dir)
        if not self.data_dir.is_dir():
            raise FileNotFoundError(f"Not a directory: {self.data_dir}")
        self._descriptor: dict[str, str] | None = None
        self._toc_flat: list[TocNode] | None = None
        self._text: bytes | None = None
        self._offsets: list[int] | None = None

    # ---------------------------------------------------------- descriptor
    def _path(self, name: str) -> Path:
        # Files are upper-case on the discs (TREE.DKI), but be tolerant.
        p = self.data_dir / name
        if p.exists():
            return p
        for cand in self.data_dir.iterdir():
            if cand.name.lower() == name.lower():
                return cand
        return p

    @property
    def descriptor(self) -> dict[str, str]:
        if self._descriptor is None:
            self._descriptor = {}
            raw = self._path("DIGIBIB.TXT").read_bytes().decode(CP, "replace")
            for line in raw.splitlines():
                line = line.strip()
                if "=" in line and not line.startswith("["):
                    k, v = line.split("=", 1)
                    self._descriptor[k.strip()] = v.strip()
        return self._descriptor

    @property
    def title(self) -> str:
        d = self.descriptor
        return d.get("Caption") or d.get("ShortTitle") or self.data_dir.name

    # ----------------------------------------------------------------- toc
    @staticmethod
    def _find_table_start(dka: bytes, n: int, cnt: int | None) -> int | None:
        """Locate the node->record table inside TREE.DKA.

        Layout (verified DB008/005/007/003/004): a structural prefix of large
        u32 values, then a monotonic non-decreasing run of exactly ``n`` u32s
        (one per TOC line) ending with ``cnt + 1`` (terminator), then a short
        tail of small values. Returns the run's start as a u32 index, or None.
        """
        if not dka or not cnt or n < 2:
            return None
        total = len(dka) // 4
        if total < n:
            return None
        vals = struct.unpack_from(f"<{total}I", dka, 0)
        for cand in range(total - n + 1):
            if vals[cand + n - 1] != cnt + 1:
                continue
            w = vals[cand : cand + n]
            if w[0] > 20:
                continue
            if all(a <= b <= cnt + 1 for a, b in zip(w, w[1:])):
                return cand
        return None

    def _load_toc(self) -> None:
        lines = self._path("TREE.DKI").read_bytes().decode(CP, "replace").split("\r\n")
        nodes: list[TocNode] = []
        for ln in lines:
            if ln == "":
                continue
            depth = len(ln) - len(ln.lstrip(" "))
            nodes.append(TocNode(index=len(nodes), depth=depth, title=ln.strip(), record=None))
        # TREE.DKA holds a 1-based start-record table for every node EXCEPT the
        # volume root, plus a terminator: table entry i maps to nodes[i + 1] as
        # ``record = entry - 1``. Verified on DB008: table index 86 holds 2072
        # -> record 2071, the true 'Der Sandmann' start (node 87); table index
        # 42 holds 293 -> record 292, the true Hoertext 'Der Sandmann' start
        # (node 43). The root (nodes[0]) spans from record 0 (title page).
        try:
            cnt = self.record_count
        except Exception:
            cnt = None
        try:
            dka = self._path("TREE.DKA").read_bytes()
        except Exception:
            dka = b""
        s = self._find_table_start(dka, len(nodes), cnt)
        if s is not None and cnt:
            assert isinstance(cnt, int)
            vals = struct.unpack_from(f"<{len(dka) // 4}I", dka, 0)
            nodes[0].record = 0
            for i in range(1, len(nodes)):
                rec = vals[s + i - 1] - 1
                nodes[i].record = rec if 0 <= rec < cnt else None
        self._toc_flat = nodes

    @property
    def toc_flat(self) -> list[TocNode]:
        if self._toc_flat is None:
            self._load_toc()
        return self._toc_flat  # type: ignore[return-value]

    def toc_tree(self) -> list[TocNode]:
        """Nest the flat TOC by depth into a forest of root nodes."""
        roots: list[TocNode] = []
        stack: list[TocNode] = []
        for node in self.toc_flat:
            node.children = []
            while stack and stack[-1].depth >= node.depth:
                stack.pop()
            if stack:
                stack[-1].children.append(node)
            else:
                roots.append(node)
            stack.append(node)
        return roots

    # -------------------------------------------------------------- records
    def _load_text(self) -> None:
        self._text = self._path("TEXT.DKI").read_bytes()
        count = struct.unpack_from("<I", self._text, 0)[0]
        self._offsets = list(struct.unpack_from(f"<{count}I", self._text, 4))
        self._offsets.append(len(self._text))  # sentinel end

    @property
    def record_count(self) -> int:
        if self._offsets is None:
            self._load_text()
        return len(self._offsets) - 1  # type: ignore[arg-type]

    def raw_record(self, i: int) -> bytes:
        if self._offsets is None:
            self._load_text()
        assert self._text is not None and self._offsets is not None
        if not 0 <= i < len(self._offsets) - 1:
            raise IndexError(f"record {i} out of range (0..{len(self._offsets) - 2})")
        return self._text[self._offsets[i] : self._offsets[i + 1]]

    @staticmethod
    def _content_region(rec: bytes) -> bytes:
        """Return the word-stream body, stripping the ``#q:...`` source-path
        marker(s).

        Most records carry the marker at the END (``...body... #q:\\path\\x.txt``).
        A few carry a source-path header at the START instead. The word-stream
        body sits between. The marker extension is usually ``.txt`` but ``.txi``
        and ``.txx`` occur, so it is matched as ``.tx`` + one alphanum.
        """
        matches = list(_MARKER.finditer(rec))
        if not matches:
            return rec
        if len(matches) == 1:
            m = matches[0]
            if m.start() < _HEADER_ZONE:
                return rec[m.end() :]
            return rec[: m.start()]
        first, last = matches[0], matches[-1]
        start = first.end() if first.start() < _HEADER_ZONE else 0
        return rec[start : last.start()]

    def record_text(self, i: int) -> str:
        """Decoded text of record i (v1 codec - see codec.py caveats)."""
        return decode_record_content(self._content_region(self.raw_record(i)))

    def node_extent(self, node_index: int) -> tuple[int | None, int | None]:
        """Record range a TOC node spans: ``(start, end)``, end exclusive.

        A node starts at its TREE.DKA record and runs until the next node that
        is not one of its descendants (same or shallower depth) with a later
        start record; the last node runs to ``record_count``. Duplicate starts
        (a parent sharing its first child's start) are skipped so a parent
        spans the whole subtree. Returns ``(None, None)`` when unmapped.
        """
        nodes = self.toc_flat
        node = nodes[node_index]
        if node.record is None:
            return (None, None)
        start = node.record
        end = self.record_count
        for nxt in nodes[node_index + 1 :]:
            if nxt.depth <= node.depth and nxt.record is not None and nxt.record > start:
                end = nxt.record
                break
        return (start, end)

    def node_text(self, node_index: int, max_records: int = MAX_NODE_RECORDS) -> str:
        """Decoded text for a TOC node: all records in its extent, concatenated.

        Capped at ``max_records`` records / ``MAX_NODE_CHARS`` chars (the volume
        root spans everything, so it always truncates). Records are print
        pages, so they join with a soft break; hyphenation across the join is
        resolved by the codec's de-hyphenation pass.
        """
        span = self.node_extent(node_index)
        if span[0] is None or span[1] is None:
            return ""
        start, end = span
        assert isinstance(start, int) and isinstance(end, int)
        end = min(end, start + max_records)
        parts: list[str] = []
        total = 0
        for r in range(start, end):
            if r >= self.record_count:
                break
            t = self.record_text(r)
            if not t:
                continue
            parts.append(t)
            total += len(t)
            if total >= MAX_NODE_CHARS:
                break
        return postprocess_text("\n".join(parts))
