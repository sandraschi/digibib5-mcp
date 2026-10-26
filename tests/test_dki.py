"""DKI codec unit tests (no disc required) + optional live-volume smoke test.

The codec tests are synthetic and always run. The live test runs only when a
real volume is present under DIGIBIB_ROOT (e.g. on the Goliath server with the
discs mounted), so CI without the discs still passes.
"""

from __future__ import annotations

import pytest

from digibib5_mcp.dki import DigibibLibrary, decode_record_content, decode_tokens
from digibib5_mcp.dki.volume import DigibibVolume


def test_decode_single_word():
    # <len=5>"Werke"<00>
    buf = b"\x05Werke\x00"
    toks = decode_tokens(buf)
    assert ("word", "Werke") in toks
    assert decode_record_content(buf) == "Werke"


def test_decode_words_with_soft_break():
    # A single 0x02 is a soft print-layout break -> reflowed to a space.
    buf = b"\x03von\x00\x02\x07Mathias\x00"
    text = decode_record_content(buf)
    assert text == "von Mathias"


def test_decode_paragraph_break():
    # 0x15-led breaks and multi-0x02 runs are paragraph breaks.
    assert decode_record_content(b"\x03von\x00\x15\x02\x07Mathias\x00") == "von\n\nMathias"
    assert decode_record_content(b"\x03von\x00\x02\x02\x02\x00\x07Mathias\x00") == "von\n\nMathias"
    # A break followed by the 04 paragraph-start sequence is a paragraph.
    assert decode_record_content(b"\x03von\x00\x02\x00\x04\x01\x07Mathias\x00") == "von\n\nMathias"


def test_running_head_dropped_anywhere():
    # 0x13 introduces a page running-head: dropped mid-text, not just leading.
    body = b"\x05Werke\x00\x02\x13\x11Hoffmann-PW Bd. 2\x02\x03Die\x00"
    assert decode_record_content(body) == "Werke Die"


def test_dehyphenation():
    # "Hoff-\nmanns" -> "Hoffmanns" (lowercase continuation).
    assert decode_record_content(b"\x05Hoff-\x02\x05manns\x00") == "Hoffmanns"
    # Uppercase continuation keeps the hyphen ("Serapions-\nBruder").
    assert decode_record_content(b"\x0aSerapions-\x02\x06Bruder\x00") == "Serapions-Bruder"
    # A dash before a space is NOT de-hyphenated ("Stimmung - bis").
    assert decode_record_content(b"\x09Stimmung-\x00 \x03bis\x00") == "Stimmung- bis"


def test_dash_word_and_literal_span():
    # A lone 0x2D that fails length parsing is a spaced dash.
    assert decode_record_content(b"\x05sagte\x00\x2d\x00\x06Chiara\x00") == "sagte - Chiara"
    # 8B/9B wrap literal content: markers vanish, content stays. A whole
    # length-less word inside (e.g. an italic "Bekenntnisse") is rescued.
    assert decode_record_content(b"\x9bBekenntnisse\x8b\x00\x04Welt\x00") == "Bekenntnisse Welt"
    # A spaced dash before a break stays spaced, not joined.
    assert decode_record_content(b"\x09herzlich.\x00\x2d\x15\x02\x09Nathanael\x00") == "herzlich. - Nathanael"


def test_leading_quote_split():
    # "«Meister" renders with a space before the opening quote.
    assert decode_record_content(b"\x05hoffw\x00\x08\xabMeister\x00") == "hoffw \xabMeister"


def test_attached_punctuation():
    # "Bertram." - inline '.' after the 7 letters
    buf = b"\x07Bertram.\x00"
    assert decode_record_content(buf) == "Bertram."


def test_cp1252_umlaut():
    # "Hörtext" with 0xf6 = ö
    buf = b"\x07H\xf6rtext\x00"
    assert decode_record_content(buf) == "Hörtext"


def test_content_region_txi_marker():
    # DB008 record 294 carries a leading .txi marker (not .txt); it must be
    # stripped, not decoded into the text.
    body = b"\x03Die\x00\x01\x01\x08Elixiere\x00"
    rec = b"\xda\x01HEADER#q:\\digibib\\8hoff\\texte\\hoff-201.txi" + body
    region = DigibibVolume._content_region(rec)
    assert b"#q:" not in region
    assert decode_record_content(region) == "Die Elixiere"


def test_content_region_leading_and_trailing():
    body = b"\x05Werke\x00"
    rec = b"\x90\x00HDR#q:\\d\\x.txt" + body + b"#q:\\d\\x.txt\x03"
    region = DigibibVolume._content_region(rec)
    assert decode_record_content(region) == "Werke"


def _have_discs() -> bool:
    try:
        return len(DigibibLibrary().list_volumes()) > 0
    except Exception:
        return False


@pytest.mark.skipif(not _have_discs(), reason="no Digibib volumes under DIGIBIB_ROOT")
def test_live_db008_hoffmann():
    lib = DigibibLibrary()
    vols = {v.id.upper(): v for v in lib.list_volumes()}
    assert "DB008" in vols
    vol = lib.open("DB008")
    assert "Hoffmann" in vol.title
    assert vol.record_count > 1000
    toc = vol.toc_flat
    assert toc and toc[0].title == "Hoffmann"
    # record 0 is the title page; it mentions Directmedia / Bertram.
    t0 = vol.record_text(0)
    assert "Bertram" in t0 or "Directmedia" in t0


@pytest.mark.skipif(not _have_discs(), reason="no Digibib volumes under DIGIBIB_ROOT")
def test_live_db008_dka_mapping():
    # TREE.DKA table: entry i (1-based) maps to nodes[i+1] as record = entry-1,
    # root maps to record 0. Spot-checked against headed records.
    vol = DigibibLibrary().open("DB008")
    toc = vol.toc_flat
    assert toc[1].record == 1  # 'Materialien zu Leben und Werk' heading record
    assert toc[43].record == 292  # Hoertext 'Der Sandmann' (Achim Huebner)
    assert "Sandmann" in toc[87].title
    assert toc[87].record == 2071  # Werke 'Der Sandmann' start (Nathanael)
    assert toc[88].record == 2131  # 'Ignaz Denner' heading record


@pytest.mark.skipif(not _have_discs(), reason="no Digibib volumes under DIGIBIB_ROOT")
def test_live_db008_node_text_spans_chapter():
    vol = DigibibLibrary().open("DB008")
    start, end = vol.node_extent(87)  # Werke 'Der Sandmann'
    assert (start, end) == (2071, 2131)
    text = vol.node_text(87)
    assert "Nathanael" in text  # first record
    assert "Coppelius" in text  # records beyond the first: full chapter, not one page
    assert "Denner" in vol.record_text(2131)  # extent ends where next chapter starts
