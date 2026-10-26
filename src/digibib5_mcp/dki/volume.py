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
