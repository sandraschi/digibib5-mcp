"""DKI text codec - the tokenized word-stream encoding used in TEXT.DKI records.

Reverse-engineered from Digitale Bibliothek 5 (see
reversing-mcp/docs/DIGIBIB5_DKI_FORMAT.md). A record's content is a stream of
word tokens and control opcodes:

- A WORD is ``<u8 length><length cp1252 bytes>`` optionally followed by inline
  attached punctuation, then a 0x00/0x01/0x02 control byte.
- ``0x00`` ends a word, ``0x01`` carries spacing/formatting runs, ``0x02``
  marks a paragraph / heading break.

STATUS: v1, approximate. It extracts readable text reliably, but the exact
control-opcode grammar (precise spacing, heading levels, italics, links) is not
fully mapped - a few length bytes in 0x01..0x0f collide with control bytes, so
some words near controls can be mis-split. Faithful HTML output needs the opcode
table, best derived by diffing against the running Digibib5 oracle. Do not treat
this as byte-exact yet.
"""

from __future__ import annotations

CP = "cp1252"

# Punctuation that attaches to the previous word (no leading space).
_ATTACH = set(".,;:!?)]}»")
_OPEN = set("([{«")
# Bytes absorbed as inline attached punctuation right after a word's letters.
_INLINE_PUNCT = b".,;:!?)('\xbb\xab-/\x95"


def decode_tokens(buf: bytes) -> list[tuple]:
    """Tokenize a record's content region into word / break / ctl tokens."""
    out: list[tuple] = []
    i, n = 0, len(buf)
    while i < n:
        b = buf[i]
        if 1 <= b <= 63 and i + 1 + b <= n:
            chunk = buf[i + 1 : i + 1 + b]
            if chunk and all(9 <= c < 127 or c >= 160 for c in chunk):
                j = i + 1 + b
                punct = bytearray()
                while j < n and buf[j] in _INLINE_PUNCT:
                    punct.append(buf[j])
                    j += 1
                word = bytes(chunk + bytes(punct)).decode(CP, "replace")
                out.append(("word", word))
                if j < n and buf[j] == 0x00:
                    j += 1
                i = j
                continue
        if b == 0x02:
            out.append(("br",))
            i += 1
            continue
        out.append(("ctl", b))
        i += 1
    return out


def render_text(tokens: list[tuple]) -> str:
    """Render tokens to plain text (v1 spacing heuristics)."""
    s: list[str] = []
    for t in tokens:
        if t[0] == "word":
            w = t[1]
            if s and not s[-1].endswith(("\n", " ")):
                prev_open = bool(s[-1]) and s[-1][-1] in _OPEN
                if w and w[0] not in _ATTACH and not prev_open:
                    s.append(" ")
            s.append(w)
        elif t[0] == "br":
            if s and not s[-1].endswith("\n"):
                s.append("\n")
    txt = "".join(s)
    while "\n\n\n" in txt:
        txt = txt.replace("\n\n\n", "\n\n")
    return txt.strip()


def decode_record_content(content: bytes) -> str:
    """Convenience: tokenize + render a record's content region to text."""
    return render_text(decode_tokens(content))
