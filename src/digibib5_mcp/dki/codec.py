"""DKI text codec - the tokenized word-stream encoding used in TEXT.DKI records.

Reverse-engineered from Digitale Bibliothek 5 (see
reversing-mcp/docs/DIGIBIB5_DKI_FORMAT.md). A record's content is a stream of
word tokens and control opcodes:

- A WORD is ``<u8 length><length cp1252 bytes>`` optionally followed by inline
  attached punctuation, then a 0x00/0x01/0x02 control byte. Newer discs set a
  0x80 high bit on most length bytes (``0x83was``) — masked off before use.
  (``0x02`` doubles as the length of 2-letter words such as "E." — the
  printable-chunk check disambiguates it from a break.)
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

STATUS: v3. Paragraph structure, running-head removal, de-hyphenation and
literal spans are mapped from DB003/004/005/007/008 evidence. v3 also strips
the stray structural glyphs that heading / paragraph-separator opcodes leave
behind (lone symbol-block chars ``¶ ª ¯ °`` and accented-capital markers), the
record/heading-type operand code that leaked as a spurious leading letter
(``a Zwey Stücke`` -> ``Zwey Stücke``), and - across DB030/DB075 - a wider set
of source-path markers (see volume.py ``_MARKER``). Open: heading LEVELS
(h1/h2) and italics are dropped not styled, and verse line breaks reflow to
spaces like prose (single 0x02 is ambiguous). Output is flowing text, not yet
byte-faithful HTML.
"""

from __future__ import annotations

import re

CP = "cp1252"

# Leading running-head / stylesheet tag that opens most records, e.g.
# "rororo-Hoffmann" or "Hoffmann-PW Bd. 1". Not body text - dropped.
_RUNNING_HEAD = re.compile(r"^[A-Za-z0-9À-ſ]+-[A-Za-z0-9À-ſ]+( Bd\. \d+)?$")

# An inline figure-reference token: an image filename (``BWE1349a.png$``,
# ``BUFAMM08.png``, ``1234.bmp``), optionally with a trailing marker byte such
# as ``$``. These are picture references, surfaced separately as node `images`
# metadata and the reader's figure strip - they are NOT body text. In newer
# picture-heavy discs (e.g. DB074 Busch) they are length-prefixed word tokens
# that would otherwise litter the prose, each preceded by a 1-char operand byte
# (the figure's marker/level) that rides in the same group.
_IMAGE_REF = re.compile(r"(?i)^[\w.\-]+\.(?:png|bmp|jpe?g|gif)[^\w]?$")

# Stray structural glyphs: heading opcodes and paragraph/section separators
# (0xA6 ¦, 0xA8 ¨, 0xAA ª, 0xAF ¯, 0xB0 °, 0xB2 ², 0xB6 ¶, ...) that decode
# grabs as a tiny 1-2 char word - "¶", "ª", or "¯u" where the 2nd char is a
# 1-byte operand. A lone char in the Latin-1 symbol block (0xA0-0xBF) or the
# C1 range (0x80-0x9F) is never real German body text. Guillemets («» 0xAB/
# 0xBB) and the bullet (• 0x2022) are real and kept; letters, digits and
# ordinary punctuation (never in these ranges) are untouched.
# Symbol-block chars that ARE legitimate standalone content and must survive:
# guillemets, bullet, section sign, copyright, and the vulgar fractions.
_GLYPH_KEEP = {
    "«",
    "»",
    "•",
    "§",
    "©",  # « » • § ©
    "¼",
    "½",
    "¾",  # ¼ ½ ¾
}


def _is_sym(c: str) -> bool:
    return 0x80 <= ord(c) <= 0xBF and c not in _GLYPH_KEEP


# Punctuation that attaches to the previous word (no leading space).
_ATTACH = set(".,;:!?)]}»")
_OPEN = set('([{\xab\x8b\x84"')
# Opening quotes glued to a word's start by length-chunking ("«Meister")
# are split off so spacing renders ("hoffw1 «Meister").
_LEAD_SPLIT = set('\xab\x8b\x84"')
# Bytes absorbed as inline attached punctuation right after a word's letters.
_INLINE_PUNCT = b".,;:!?)('\xbb\xab-/\x95"


def _decode_chunk(chunk: bytes, encoding: str) -> str | None:
    """Decode a word chunk, supporting 0x05 <b2> Cyrillic escapes (DB006).

    Returns None if the chunk contains invalid control bytes (not a real word).
    """
    if not chunk:
        return None
    if all(32 <= c < 127 or c >= 160 for c in chunk):
        return chunk.decode(encoding, "replace")
    if "8859-5" not in encoding.lower() or 0x05 not in chunk:
        return None
    out: list[str] = []
    k = 0
    m = len(chunk)
    while k < m:
        c = chunk[k]
        if c == 0x05 and k + 1 < m:
            mapped = chunk[k + 1] + 0x9A
            if not 0xA0 <= mapped <= 0xFF:
                return None
            out.append(bytes([mapped]).decode("iso-8859-5", "replace"))
            k += 2
        elif 32 <= c < 127 or c >= 160:
            out.append(bytes([c]).decode(encoding, "replace"))
            k += 1
        else:
            return None
    return "".join(out)


def decode_tokens(buf: bytes, encoding: str = CP) -> list[tuple]:
    """Tokenize a record's content region into word / br / para / ctl tokens."""
    out: list[tuple] = []
    i, n = 0, len(buf)
    while i < n:
        b = buf[i]
        if b == 0x15:
            # Paragraph marker: the break run that always follows is part of it.
            out.append(("para",))
            i += 1
            while i < n and buf[i] == 0x02:
                i += 1
            continue
        # Length with optional 0x80 high bit (newer discs set it on most words:
        # 0x83was, 0x87Kindern, 0x8B = len 11, 0x9B = len 27). Try word decode
        # before 0x8B/0x9B literal-group fallback so 11/27-byte words aren't hijacked.
        lb = (b & 0x3F) if 0x80 <= b <= 0xBF else b
        if 1 <= lb <= 63 and i + 1 + lb <= n:
            chunk = buf[i + 1 : i + 1 + lb]
            # Printable bytes (or 0x05-escaped Cyrillic in DB006). Rejecting
            # 9..31 keeps formatting opcodes from masquerading as 1-char words.
            decoded_chunk = _decode_chunk(chunk, encoding)
            if decoded_chunk is not None:
                j = i + 1 + lb
                punct = bytearray()
                while j < n and buf[j] in _INLINE_PUNCT:
                    punct.append(buf[j])
                    j += 1
                word = decoded_chunk + bytes(punct).decode(encoding, "replace")
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
        # 0x8B/0x9B: transparent literal-group markers when not a valid 11/27-byte word.
        if b == 0x8B or b == 0x9B:
            j = i + 1
            while j < n and (32 <= buf[j] < 127 or buf[j] >= 160):
                j += 1
            if j > i + 1:
                lit = buf[i + 1 : j].decode(encoding, "replace")
                if lit.strip():
                    out.append(("word", lit))
            i = j if j > i + 1 else i + 1
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


def _is_header_code(tokens: list[tuple], i: int) -> bool:
    """A lone single-character word that is a record/heading-type operand code,
    not body text. It sits in the record header as ``01 <char> 00`` and is
    always immediately followed by the 0xAF heading opcode (e.g. the spurious
    "a" in "a Zwey Stücke", "B" in "B stets als Werk")."""
    w = tokens[i][1].strip()
    if len(w) != 1 or not w.isalnum():
        return False
    return 0xAF in _ctl_window(tokens, i, +1, limit=4)


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
            if _is_head_word(tokens, i) or _is_header_code(tokens, i):
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


def _strip_figure_refs(tokens: list[tuple]) -> list[tuple]:
    """Remove inline image-filename tokens (and the 1-char operand byte that
    rides in the same figure-marker group) so picture references do not litter
    the prose. Figures are surfaced separately as node `images` metadata.
    """
    word_idx = [k for k, t in enumerate(tokens) if t[0] == "word"]
    drop: set[int] = set()
    for wi, k in enumerate(word_idx):
        if _IMAGE_REF.match(tokens[k][1].strip()):
            drop.add(k)
            # The preceding word, if a lone operand char with only ctl/br/para
            # between it and the filename, belongs to the figure marker.
            if wi > 0:
                pk = word_idx[wi - 1]
                if len(tokens[pk][1].strip()) == 1:
                    drop.add(pk)
    if not drop:
        return tokens
    return [t for idx, t in enumerate(tokens) if idx not in drop]


def _strip_head_marks(tokens: list[tuple]) -> list[tuple]:
    """Drop stray structural glyphs that heading / paragraph-separator opcodes
    leave as a tiny word: a lone symbol-block char (``¶``, ``ª``, ``¯``, ``°``)
    or a lone accented capital used as a separator (``Â``, ``Ë``), and the
    marker-plus-1-char-operand form (``¯u``).

    The lone case also drops accented capitals (0xC0-0xDE), which are never a
    one-character German word; the 2-char operand case is restricted to the
    symbol block so real two-letter words like "Öl" or "Äh" are untouched.
    """
    out: list[tuple] = []
    for t in tokens:
        if t[0] == "word":
            w = t[1].strip()
            if w:
                c0 = ord(w[0])
                lone = len(w) == 1 and (_is_sym(w[0]) or (0xC0 <= c0 <= 0xDE and c0 != 0xD7))
                operand = len(w) == 2 and _is_sym(w[0]) and w[1].isalnum()
                if lone or operand:
                    continue
        out.append(t)
    return out


def decode_record_content(content: bytes, encoding: str = CP) -> str:
    """Convenience: tokenize + render a record's content region to text."""
    tokens = decode_tokens(content, encoding=encoding)
    # Drop a leading running-head / stylesheet tag if present.
    for idx, t in enumerate(tokens):
        if t[0] == "word":
            if _RUNNING_HEAD.match(t[1]):
                tokens = tokens[idx + 1 :]
            break
    tokens = _strip_figure_refs(tokens)
    tokens = _strip_head_marks(tokens)
    return render_text(tokens)
