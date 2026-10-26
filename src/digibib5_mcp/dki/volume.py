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

import struct
from dataclasses import dataclass, field
from pathlib import Path

from .codec import decode_record_content

CP = "cp1252"


@dataclass
class TocNode:
    index: int          # line index in TREE.DKI
    depth: int          # indentation depth
    title: str
    record: int | None  # record index into TEXT.DKI (from TREE.DKA), if known
    children: list["TocNode"] = field(default_factory=list)


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
    def _load_toc(self) -> None:
        lines = self._path("TREE.DKI").read_bytes().decode(CP, "replace").split("\r\n")
        nodes: list[TocNode] = []
        for ln in lines:
            if ln == "":
                continue
            depth = len(ln) - len(ln.lstrip(" "))
            nodes.append(TocNode(index=len(nodes), depth=depth, title=ln.strip(), record=None))
        # TREE.DKA: the trailing section is a u32 array, one entry per TOC line,
        # giving each node's record index. We read the LAST `len(nodes)` u32s
        # that fit, which is the node->record table (a structural prefix precedes
        # it). This is v1; the prefix layout is not fully mapped.
        try:
            dka = self._path("TREE.DKA").read_bytes()
            total = len(dka) // 4
            vals = list(struct.unpack_from(f"<{total}I", dka, 0))
            if len(vals) >= len(nodes):
                tail = vals[len(vals) - len(nodes) :]
                for node, rec in zip(nodes, tail):
                    node.record = rec
        except Exception:
            pass
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
            raise IndexError(f"record {i} out of range (0..{len(self._offsets)-2})")
        return self._text[self._offsets[i] : self._offsets[i + 1]]

    @staticmethod
    def _content_region(rec: bytes) -> bytes:
        """Return the word-stream body, stripping the ``#q:...txt`` source-path
        marker(s).

        Most records carry the marker at the END (``...body... #q:\\path\\x.txt``).
        A few carry a source-path header at the START instead. The word-stream
        body sits between. The codec (decode_tokens) resyncs over the few header
        control bytes, so a slightly generous start is harmless; the critical
        thing is not to chop the body, which the old logic did by treating the
        trailing ``.txt`` as a leading header marker.
        """
        end = rec.rfind(b"#q:")
        if end <= 0:
            end = len(rec)
        start = 0
        # Strip a LEADING source-path header only when the record actually opens
        # with one (a '#q:' that precedes the first '.txt' and is earlier than
        # the trailing marker).
        first_txt = rec.find(b".txt")
        lead_q = rec.find(b"#q:")
        if first_txt != -1 and first_txt < end and 0 <= lead_q < first_txt and lead_q < end:
            start = first_txt + 4
        return rec[start:end]

    def record_text(self, i: int) -> str:
        """Decoded text of record i (v1 codec - see codec.py caveats)."""
        return decode_record_content(self._content_region(self.raw_record(i)))

    def node_text(self, node_index: int) -> str:
        """Decoded text for a TOC node (via its TREE.DKA record index)."""
        node = self.toc_flat[node_index]
        if node.record is None:
            return ""
        rec = node.record
        if rec >= self.record_count:
            return ""
        return self.record_text(rec)
