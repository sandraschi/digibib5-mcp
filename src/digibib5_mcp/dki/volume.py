"""DigibibVolume - open a Digitale Bibliothek 5 CD-ROM image and read it.

A volume is a ``data\\`` folder containing:
- ``DIGIBIB.TXT``  - INI descriptor (identity shown in the CD picker).
- ``TREE.DKI``     - TOC as indented CP1252 text (leading spaces = depth).
- ``TREE.DKA``     - u32 table mapping each TOC line to a TEXT.DKI record index
                     (shifted 1-based on older discs, direct on newer ones).
- ``TEXT.DKI``     - records with a u32 offset table: variant A
                     ``[u32 count][offsets]`` (DB008) or variant B
                     ``[u32 magic][offsets...]`` (DB074); each record is
                      length-prefixed, bracketed by its ``#q:\\...`` source path.

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

# Figure refs in record bytes, e.g. b"0092.bmp" (introduced by opcode 0x0B).
_BMP_REF = re.compile(rb"(?i)\b([0-9A-Za-z]+\.bmp)\b")
# Strict file name guard for serving (no traversal): e.g. "0092.BMP".
_IMAGE_NAME = re.compile(r"(?i)^[0-9A-Za-z]+\.bmp$")


def parse_bmp_info(data: bytes) -> dict | None:
    """Width/height/bpp from a BMP header, or None (not a BMP / truncated)."""
    if len(data) < 30 or data[:2] != b"BM":
        return None
    dib = struct.unpack_from("<I", data, 14)[0]
    if dib < 40 or len(data) < 30:
        return None
    width, height = struct.unpack_from("<ii", data, 18)
    bpp = struct.unpack_from("<H", data, 28)[0]
    return {"width": width, "height": abs(height), "bpp": bpp, "bytes": len(data)}


# Source-path marker in TEXT.DKI records: ``#q:\...\hoff-200.txt`` (DB008)
# or ``\x0e:q:\...\wbw-0000.xml`` (DB074, no hash, spaces in the path).
_MARKER = re.compile(rb"(?:\x0e:|\x0e#|#)q:(?:[^\\:\x00-\x1f]*\\)+[^\\:\x00-\x1f:]*\.[A-Za-z0-9]{2,4}(?![A-Za-z0-9])")
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
    def _find_table_start(dka: bytes, n: int, cnt: int | None) -> tuple[int, str] | None:
        """Locate the node->record table inside TREE.DKA.

        Layouts seen (verified DB003/004/005/007/008, DB074):
        - a structural prefix of large u32 values, then a monotonic
          non-decreasing run of exactly ``n`` u32s (one per TOC line).
        - SHIFTED (older discs): the run ends with ``cnt + 1`` (terminator);
          entry *i* maps to nodes[*i + 1*] as ``record = entry - 1`` and the
          root spans from record 0. First value is 2 (records 0-1 preamble).
        - DIRECT (newer discs, e.g. DB074): no terminator; entry *i* maps to
          nodes[*i*] as ``record = entry``. First value is 1.
        Returns (start_u32_index, "shifted" | "direct"), or None.
        """
        if not dka or not cnt or n < 2:
            return None
        total = len(dka) // 4
        if total < n:
            return None
        vals = struct.unpack_from(f"<{total}I", dka, 0)

        def is_run(s: int) -> bool:
            w = vals[s : s + n]
            if w[0] > 20:
                return False
            if vals[s + n - 1] > cnt + 1:
                return False
            return all(a <= b <= cnt + 1 for a, b in zip(w, w[1:]))

        for s in range(total - n + 1):
            # SHIFTED first: exact legacy behavior (terminator run).
            if vals[s + n - 1] == cnt + 1 and is_run(s):
                return (s, "shifted")
        for s in range(total - n + 1):
            if is_run(s):
                return (s, "direct")
        return None

    @staticmethod
    def _looks_textual(text: str) -> bool:
        """Heuristic: decoded record holds prose, not binary preamble junk."""
        if len(text) < 20:
            return False
        letters = sum(1 for c in text if c.isalpha())
        return letters / len(text) > 0.4

    def _first_readable(self, start: int, cnt: int) -> int:
        """First record at/after ``start`` that decodes to prose (root span)."""
        for r in range(start, min(start + 10, cnt)):
            try:
                if self._looks_textual(self.record_text(r)):
                    return r
            except Exception:
                continue
        return start

    def _load_toc(self) -> None:
        lines = self._path("TREE.DKI").read_bytes().decode(CP, "replace").split("\r\n")
        nodes: list[TocNode] = []
        for ln in lines:
            if ln == "":
                continue
            depth = len(ln) - len(ln.lstrip(" "))
            nodes.append(TocNode(index=len(nodes), depth=depth, title=ln.strip(), record=None))
        # TREE.DKA holds a start-record table, one entry per TOC line:
        # SHIFTED (older discs, DB008): table entry i maps to nodes[i + 1] as
        # ``record = entry - 1`` (1-based), root spans from record 0.
        # DIRECT (newer discs, DB074): table entry i maps to nodes[i] as
        # ``record = entry``; root spans from the first decodable record.
        # Verified: DB008 node87 -> 2071, DB074 node117 -> rec477 'Der Sandmann'
        # heading, node1 -> rec3 'Einführung' heading.
        try:
            cnt = self.record_count
        except Exception:
            cnt = None
        try:
            dka = self._path("TREE.DKA").read_bytes()
        except Exception:
            dka = b""
        found = self._find_table_start(dka, len(nodes), cnt)
        if found is not None and cnt:
            assert isinstance(cnt, int)
            s, mode = found
            vals = struct.unpack_from(f"<{len(dka) // 4}I", dka, 0)
            if mode == "shifted":
                nodes[0].record = 0
                for i in range(1, len(nodes)):
                    rec = vals[s + i - 1] - 1
                    nodes[i].record = rec if 0 <= rec < cnt else None
            else:
                for i in range(len(nodes)):
                    rec = vals[s + i]
                    nodes[i].record = rec if 0 <= rec < cnt else None
                nodes[0].record = self._first_readable(nodes[0].record or 0, cnt)
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
    @staticmethod
    def _parse_offsets(data: bytes) -> list[int] | None:
        """Offset table of TEXT.DKI: absolute, monotonic record starts.

        Variant A (older discs, DB008): ``[u32 count][count offsets ...]``.
        Variant B (newer discs, DB074): ``[u32 magic][offsets ...]`` with no
        declared count - the table is the whole monotonic run.
        """
        if len(data) < 8:
            return None
        total = len(data) // 4
        vals = struct.unpack(f"<{total}I", data[: total * 4])

        def monotonic(ws: list[int]) -> bool:
            return all(a <= b < len(data) for a, b in zip(ws, ws[1:]))

        # Variant A: declared count that fits, table in-bounds + monotonic.
        count = vals[0]
        if 0 < count < total and 4 + 4 * count <= len(data):
            cand = list(vals[1 : 1 + count])
            if cand and cand[0] >= 4 + 4 * count and monotonic(cand):
                return cand
        # Variant B: longest monotonic run from u32 index 1 on.
        run = [vals[1]]
        for v in vals[2:]:
            if v < run[-1] or v >= len(data):
                break
            run.append(v)
        return run if len(run) >= 2 else None

    def _load_text(self) -> None:
        self._text = self._path("TEXT.DKI").read_bytes()
        offs = self._parse_offsets(self._text)
        if not offs:
            raise ValueError(f"TEXT.DKI has no readable offset table ({self.data_dir})")
        self._offsets = offs
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
            # One marker is a trailing one, unless the body after it is
            # longer than the bytes before it (leading source-path header,
            # e.g. DB008's .txi records; short DB074 records carry only
            # a trailing marker).
            m = matches[0]
            before, after = rec[: m.start()], rec[m.end() :]
            return after if len(after) > len(before) else before
        first, last = matches[0], matches[-1]
        start = first.end() if first.start() < _HEADER_ZONE else 0
        return rec[start : last.start()]

    def record_text(self, i: int) -> str:
        """Decoded text of record i (v1 codec - see codec.py caveats)."""
        return decode_record_content(self._content_region(self.raw_record(i)))

    def _compute_extents(self) -> list[tuple[int | None, int | None]]:
        """All chapter extents in one right-to-left pass (amortized O(n)).

        end[i] = first later record starting at a node that is not a
        descendant of i (same or shallower depth, strictly later start),
        else ``record_count``. Unmapped nodes get ``(None, None)``.
        """
        nodes = self.toc_flat
        n = len(nodes)
        count = self.record_count
        extents: list[tuple[int | None, int | None]] = [(None, None)] * n
        stack: list[tuple[int, int]] = []  # (depth, record), nearest last
        for i in range(n - 1, -1, -1):
            rec = nodes[i].record
            if rec is None:
                continue
            d = nodes[i].depth
            while stack and stack[-1][0] > d:
                stack.pop()
            end = count
            for sd, sr in reversed(stack):
                if sd <= d and sr > rec:
                    end = sr
                    break
            extents[i] = (rec, end)
            stack.append((d, rec))
        return extents

    @property
    def _extents(self) -> list[tuple[int | None, int | None]]:
        if self.__dict__.get("_extents_cache") is None:
            self.__dict__["_extents_cache"] = self._compute_extents()
        return self.__dict__["_extents_cache"]

    def node_extent(self, node_index: int) -> tuple[int | None, int | None]:
        """Record range a TOC node spans: ``(start, end)``, end exclusive.

        A node starts at its TREE.DKA record and runs until the next node that
        is not one of its descendants (same or shallower depth) with a later
        start record; the last node runs to ``record_count``. Duplicate starts
        (a parent sharing its first child's start) are skipped so a parent
        spans the whole subtree. Returns ``(None, None)`` when unmapped.
        """
        return self._extents[node_index]

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

    def node_for_record(self, record: int) -> TocNode | None:
        """Deepest TOC node whose chapter extent contains ``record``."""
        best: TocNode | None = None
        for node, (start, end) in zip(self.toc_flat, self._extents):
            if start is not None and end is not None and start <= record < end:
                if best is None or node.depth > best.depth:
                    best = node
        return best

    # -------------------------------------------------------------- images
    def _images_dir(self) -> Path | None:
        # DB008 keeps IMAGES/ next to data/ at the volume root; the format
        # doc has it inside data/. Support both.
        for cand in (self.data_dir / "IMAGES", self.data_dir.parent / "IMAGES"):
            if cand.is_dir():
                return cand
        return None

    def image_levels(self) -> list[int]:
        """Available zoom levels (subfolders 1..4)."""
        d = self._images_dir()
        if d is None:
            return []
        return sorted(int(p.name) for p in d.iterdir() if p.is_dir() and p.name.isdigit())

    def images(self, level: int | None = None) -> list[dict]:
        """Figures at a zoom level: [{name, width, height, bpp, bytes}]."""
        d = self._images_dir()
        if d is None:
            return []
        levels = self.image_levels()
        if not levels:
            return []
        if level is None:
            level = max(levels)
        ldir = d / str(level)
        if not ldir.is_dir():
            return []
        out = []
        for p in sorted(ldir.iterdir()):
            if p.is_file() and _IMAGE_NAME.match(p.name):
                with open(p, "rb") as f:
                    info = parse_bmp_info(f.read(60))
                out.append(
                    {
                        "name": p.name.upper(),
                        "width": info["width"] if info else None,
                        "height": info["height"] if info else None,
                        "bpp": info["bpp"] if info else None,
                        "bytes": p.stat().st_size,
                    }
                )
        return out

    def image_bytes(self, level: int, name: str) -> bytes:
        """Raw bytes of one figure (name validated against traversal)."""
        if not _IMAGE_NAME.match(name or ""):
            raise FileNotFoundError(f"bad image name: {name!r}")
        d = self._images_dir()
        if d is None:
            raise FileNotFoundError(f"no IMAGES dir in {self.data_dir}")
        for cand in (d / str(level) / name.upper(), d / str(level) / name.lower()):
            if cand.is_file():
                return cand.read_bytes()
        raise FileNotFoundError(f"image not found: {level}/{name}")

    def node_image_refs(self, node_index: int) -> list[str]:
        """Figure file names referenced by a chapter's records (raw scan)."""
        span = self.node_extent(node_index)
        if span[0] is None or span[1] is None:
            return []
        found: set[str] = set()
        for r in range(span[0], min(span[1], self.record_count)):
            try:
                raw = self.raw_record(r)
            except IndexError:
                break
            for m in _BMP_REF.finditer(raw):
                found.add(m.group(1).decode("ascii", "replace").upper())
        return sorted(found)

    def search(self, query: str, limit: int = 20) -> list[dict]:
        """Full-text search over decoded chapter text (FTS5 sidecar, see
        ``dki/search.py``). Each hit carries its chapter for context::

            {"record": int, "node_index": int | None, "chapter": str | None,
             "snippet": str}
        """
        from .search import search_records

        volume_id = Path(self.data_dir).parent.name
        hits, _rebuilt = search_records(self, volume_id, query, limit)
        out = []
        for rec, snippet in hits:
            node = self.node_for_record(rec)
            out.append(
                {
                    "record": rec,
                    "node_index": node.index if node else None,
                    "chapter": node.title if node else None,
                    "snippet": snippet,
                }
            )
        return out
