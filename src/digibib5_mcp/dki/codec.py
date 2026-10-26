"""DKI text codec - the tokenized word-stream encoding used in TEXT.DKI records.

Reverse-engineered from Digitale Bibliothek 5 (see
reversing-mcp/docs/DIGIBIB5_DKI_FORMAT.md). A record's content is a stream of
word tokens and control opcodes:

- A WORD is ``<u8 length><length cp1252 bytes>`` optionally followed by inline
  attached punctuation, then a 0x00/0x01/0x02 control byte. (``0x02`` doubles
  as the length of 2-letter words such as "E." - the printable-chunk check
  disambiguates it from a break.)
- ``0x01`` carries spacing/formatting runs (usually doubled). Dropped; words
  are joined with single spaces.
- ``0x02`` is a soft line break (print layout). A run of 2+ is a paragraph
  break, as is any break led by ``0x15`` (paragraph marker, 99.9% followed by
  a break) or followed by ``04 01`` (paragraph-start sequence).
- ``0x13`` introduces a page running-head: the next word (``Hoffmann-PW Bd. N``,
  ``rororo-Hoffmann``) is page furniture, not body text. Dropped wherever it
  occurs, not just at record start.
- ``0x08``/``0x00`` frame title/attribute spans; ``0x04``/``0x07``/``0x05``/
  ``0x06``/``0x0f``/``0x10`` carry style attributes with operand bytes. All
  dropped - operands never surface as text.
- ``0x8B``/``0x9B`` wrap literal content (spaced punctuation such as
  Gedankenstriche, italic/literal words): the markers are transparent and any
  printable run inside is decoded as literal text.
- ``0x0B`` prefixes a cross-reference (``hoffwN`` work links, ``NNNN.bmp``
  figure refs). The reference word itself is kept as readable text.
- A lone ``0x2D`` that fails length parsing is a spaced dash (Gedankenstrich),
  kept as a "-" word. Words ending in "-" hyphenated across a break are
  re-joined in rendering (``Hoff-\\nmanns`` -> ``Hoffmanns``).

STATUS: v2. Paragraph structure, running-head removal, de-hyphenation and
literal spans are mapped from DB003/004/005/007/008 evidence. Open: exact
meaning of 0x0E block markers, 0x0C block ends, lone 0x84/0x94/0xAB/0xBB bytes
(0x94 verified as a 0x0F operand - left dropped), heading levels, italics.
Output is flowing text, not yet byte-faithful HTML.
"""

from __future__ import annotations

import re

CP = "cp1252"

# Leading running-head / stylesheet tag that opens most records, e.g.
# "rororo-Hoffmann" or "Hoffmann-PW Bd. 1". Not body text - dropped.
_RUNNING_HEAD = re.compile(r"^[A-Za-z0-9À-ſ]+-[A-Za-z0-9À-ſ]+( Bd\. \d+)?$")

# Punctuation that attaches to the previous word (no leading space).
_ATTACH = set(".,;:!?)]}»")
_OPEN = set('([{\xab\x8b\x84"')
# Opening quotes glued to a word's start by length-chunking ("«Meister")
# are split off so spacing renders ("hoffw1 «Meister").
_LEAD_SPLIT = set('\xab\x8b\x84"')
# Bytes absorbed as inline attached punctuation right after a word's letters.
_INLINE_PUNCT = b".,;:!?)('\xbb\xab-/\x95"


def decode_tokens(buf: bytes) -> list[tuple]:
    """Tokenize a record's content region into word / br / para / ctl tokens."""
    out: list[tuple] = []
    i, n = 0, len(buf)
    while i < n:
        b = buf[i]
        # 0x8B/0x9B: transparent literal-group markers. Decode any printable
        # run inside as literal text (italic/literal words, spaced punctuation);
        # bare markers vanish.
        if b == 0x8B or b == 0x9B:
            j = i + 1
            while j < n and (32 <= buf[j] < 127 or buf[j] >= 160):
                j += 1
            if j > i + 1:
                lit = buf[i + 1 : j].decode(CP, "replace")
                if lit.strip():
                    out.append(("word", lit))
            i = j if j > i + 1 else i + 1
            continue
        if b == 0x15:
            # Paragraph marker: the break run that always follows is part of it.
            out.append(("para",))
            i += 1
            while i < n and buf[i] == 0x02:
                i += 1
            continue
        if 1 <= b <= 63 and i + 1 + b <= n:
            chunk = buf[i + 1 : i + 1 + b]
            # Printable CP1252 only. Allowing 9..31 (as a first pass did) let
            # formatting opcodes 0x09/0x0b/0x0c/0x0e-0x12 masquerade as 1-char
            # words and leak into the text as control glyphs. A real word is
            # ASCII-printable or high-CP1252 (>=160).
            if chunk and all(32 <= c < 127 or c >= 160 for c in chunk):
                j = i + 1 + b
                punct = bytearray()
                while j < n and buf[j] in _INLINE_PUNCT:
                    punct.append(buf[j])
                    j += 1
                word = bytes(chunk + bytes(punct)).decode(CP, "replace")
                # Split glued opening quotes ("«Meister" -> "«" + "Meister").
                while len(word) > 1 and word[0] in _LEAD_SPLIT:
                    out.append(("word", word[0]))
                    word = word[1:]
                if word and word.strip():
                    out.append(("word", word))
                if j < n and buf[j] == 0x00:
                    j += 1
                i = j
                continue
            # A rejected 0x2D is a spaced dash (Gedankenstrich), not a length.
            if b == 0x2D:
                out.append(("word", "-"))
                i += 1
                continue
        if b == 0x02:
            # 0x02 doubles as the length of 2-letter words ("E.") - but those
            # parsed above (printable chunk). A bare 0x02 starts a break run:
            # 2+ is a paragraph, a single is a soft print-layout break.
            j = i
            while j < n and buf[j] == 0x02:
                j += 1
            out.append(("para",) if j - i >= 2 else ("br",))
            i = j
            continue
        if b == 0x2D and i + 1 + b > n:
            # Trailing dash cut off by the record end: spaced dash, not length.
            out.append(("word", "-"))
            i += 1
            continue
        out.append(("ctl", b))
        i += 1
    return out


def _ctl_window(tokens: list[tuple], i: int, direction: int, limit: int = 4) -> list[int]:
    """Collect consecutive ctl values from index i (exclusive) going direction
    (-1 back, +1 forward), stopping at any word/br/para token or the limit."""
    vals: list[int] = []
    j = i + direction
    while 0 <= j < len(tokens) and len(vals) < limit and tokens[j][0] == "ctl":
        vals.append(tokens[j][1])
        j += direction
    return vals


def _is_head_word(tokens: list[tuple], i: int) -> bool:
    """A word introduced by opcode 0x13 is a page running-head
    (``Hoffmann-PW Bd. N``, ``rororo-Hoffmann``), never body text."""
    return 0x13 in _ctl_window(tokens, i, -1)


def _is_para_break(tokens: list[tuple], i: int) -> bool:
    """A single soft break that is really a paragraph boundary: led by the
    0x15 paragraph marker, or followed by the 04 paragraph-start sequence."""
    if 0x15 in _ctl_window(tokens, i, -1):
        return True
    return 0x04 in _ctl_window(tokens, i, +1)


def render_text(tokens: list[tuple]) -> str:
    """Render tokens to flowing text (v2 reflow).

    Soft print-layout breaks become spaces; paragraph breaks (0x15-led,
    multi-0x02 runs, 04-led) become blank lines; page running-heads are
    dropped; hyphenated line splits are re-joined (``Hoff-\\nmanns`` ->
    ``Hoffmanns``, ``Serapions-\\nBruder`` -> ``Serapions-Bruder``).
    """
    s: list[str] = []
    prev_word: str | None = None
    for i, t in enumerate(tokens):
        if t[0] == "word":
            if _is_head_word(tokens, i):
                continue
            w = t[1]
            if s and not s[-1].endswith(("\n", " ")):
                prev_open = bool(s[-1]) and s[-1][-1] in _OPEN
                if w and w[0] not in _ATTACH and not prev_open:
                    s.append(" ")
            s.append(w)
            prev_word = w
        elif t[0] == "para":
            if prev_word and prev_word.endswith("-") and len(prev_word) > 1:
                s.append("\n")  # hyphenation signal; joined in post-pass
            elif s and not s[-1].endswith("\n\n"):
                s.append("\n" if s[-1].endswith("\n") else "\n\n")
            prev_word = None
        elif t[0] == "br":
            if prev_word and prev_word.endswith("-") and len(prev_word) > 1:
                s.append("\n")  # hyphenation signal; joined in post-pass
            elif _is_para_break(tokens, i):
                if s and not s[-1].endswith("\n\n"):
                    s.append("\n" if s[-1].endswith("\n") else "\n\n")
            elif s and not s[-1].endswith((" ", "\n")):
                s.append(" ")
            prev_word = None
    return postprocess_text("".join(s))


def postprocess_text(txt: str) -> str:
    """Normalize rendered text: de-hyphenate line splits (only across line
    breaks - a "-" before a space is a spaced dash), fix spaced dashes split
    across breaks, and collapse redundant whitespace."""
    # De-hyphenate line splits, but only across line breaks: a "-" before a
    # space is a spaced dash ("Stimmung - bis"), not a split word. (ß never
    # starts a word, but is listed for explicitness.)
    txt = re.sub(r"([A-Za-zÀ-ſß])-(\n+)([a-zà-ſß])", r"\1\3", txt)
    txt = re.sub(r"([A-Za-zÀ-ſß])-(\n+)([A-ZÀ-Þ])", r"\1-\3", txt)
    txt = re.sub(r"([A-Za-zÀ-ſß])-(\n+)-", r"\1 - ", txt)
    # A spaced dash before a break stays spaced ("herzlich. -\nNathanael").
    txt = re.sub(r" - *\n+", " - ", txt)
    txt = re.sub(r"[ \t]{2,}", " ", txt)
    while "\n\n\n" in txt:
        txt = txt.replace("\n\n\n", "\n\n")
    return txt.strip()


def decode_record_content(content: bytes) -> str:
    """Convenience: tokenize + render a record's content region to text."""
    tokens = decode_tokens(content)
    # Drop a leading running-head / stylesheet tag if present.
    for idx, t in enumerate(tokens):
        if t[0] == "word":
            if _RUNNING_HEAD.match(t[1]):
                tokens = tokens[idx + 1 :]
            break
    return render_text(tokens)
