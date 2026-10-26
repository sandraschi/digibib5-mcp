"""DKI codec unit tests (no disc required) + optional live-volume smoke test.

The codec tests are synthetic and always run. The live test runs only when a
real volume is present under DIGIBIB_ROOT (e.g. on the Goliath server with the
discs mounted), so CI without the discs still passes.
"""

from __future__ import annotations

import struct

import pytest

from digibib5_mcp.dki import DigibibLibrary, decode_record_content, decode_tokens
from digibib5_mcp.dki.search import ensure_built, search_records
from digibib5_mcp.dki.volume import DigibibVolume, parse_bmp_info


def _bmp_2x2() -> bytes:
    dib = struct.pack("<IiiHHIIiiII", 40, 2, 2, 1, 24, 0, 16, 0, 0, 0, 0)
    fh = struct.pack("<2sIHHI", b"BM", 54 + 16, 0, 0, 54)
    return fh + dib + b"\x00" * 16


def test_parse_bmp_info():
    info = parse_bmp_info(_bmp_2x2())
    assert info is not None
    assert (info["width"], info["height"], info["bpp"]) == (2, 2, 24)
    assert parse_bmp_info(b"not a bmp") is None
    assert parse_bmp_info(b"BM") is None


def test_images_hermetic(tmp_path):
    imgdir = tmp_path / "IMAGES" / "1"
    imgdir.mkdir(parents=True)
    (imgdir / "0001.BMP").write_bytes(_bmp_2x2())
    vol = _make_volume(tmp_path, [_word("Hallo")])
    assert vol.image_levels() == [1]
    figs = vol.images()
    assert len(figs) == 1 and figs[0]["name"] == "0001.BMP"
    assert (figs[0]["width"], figs[0]["height"]) == (2, 2)
    assert vol.image_bytes(1, "0001.bmp")[:2] == b"BM"
    try:
        vol.image_bytes(1, "../evil.bmp")
        raise AssertionError("traversal accepted")
    except FileNotFoundError:
        pass
    try:
        vol.image_bytes(2, "0001.BMP")
        raise AssertionError("missing level accepted")
    except FileNotFoundError:
        pass


def _word(text: str) -> bytes:
    raw = text.encode("cp1252")
    return bytes([len(raw)]) + raw + b"\x00"


def _make_volume(tmp_path, records: list[bytes]):
    """Minimal on-disk volume: descriptor + 2-line TOC + TEXT.DKI (no DKA)."""
    (tmp_path / "DIGIBIB.TXT").write_bytes(b"[Default]\nCaption=Testvol\n")
    (tmp_path / "TREE.DKI").write_bytes("Root\r\n Child".encode("cp1252"))
    blob = bytearray()
    blob += struct.pack("<I", len(records))
    offs_pos = len(blob)
    blob += b"\x00" * (4 * len(records))
    offsets = []
    pos = 4 + 4 * len(records)
    for rec in records:
        offsets.append(pos)
        pos += len(rec)
    struct.pack_into(f"<{len(records)}I", blob, offs_pos, *offsets)
    for rec in records:
        blob += rec
    (tmp_path / "TEXT.DKI").write_bytes(bytes(blob))
    return DigibibVolume(tmp_path)


def _make_volume_variant_b(tmp_path, records: list[bytes]):
    """TEXT.DKI variant B (DB074): [u32 magic][offsets...], no declared count."""
    (tmp_path / "DIGIBIB.TXT").write_bytes(b"[Default]\nCaption=Testvol\n")
    (tmp_path / "TREE.DKI").write_bytes("Root\r\n Child".encode("cp1252"))
    blob = bytearray()
    blob += struct.pack("<I", 0x1924CC)
    offs_pos = len(blob)
    blob += b"\x00" * (4 * len(records))
    offsets = []
    pos = 4 + 4 * len(records)
    for rec in records:
        offsets.append(pos)
        pos += len(rec)
    struct.pack_into(f"<{len(records)}I", blob, offs_pos, *offsets)
    for rec in records:
        blob += rec
    (tmp_path / "TEXT.DKI").write_bytes(bytes(blob))
    return DigibibVolume(tmp_path)


def test_text_dki_variant_b(tmp_path):
    vol = _make_volume_variant_b(
        tmp_path,
        [_word("Hallo") + _word("du"), _word("Welt")],
    )
    assert vol.record_count == 2
    assert vol.record_text(0) == "Hallo du"
    assert vol.record_text(1) == "Welt"


def test_search_hermetic(tmp_path):
    vol = _make_volume(
        tmp_path,
        [
            _word("Hallo") + _word("Welt"),
            _word("Nathanael") + _word("spaziert"),
            _word("Achim") + _word("H\xfcbner"),
        ],
    )
    assert vol.record_count == 3
    db = tmp_path / "t.db"
    assert ensure_built(vol, "TESTVOL", db) is True
    assert ensure_built(vol, "TESTVOL", db) is False  # cached
    hits, rebuilt = search_records(vol, "TESTVOL", "Nathanael", db_path=db)
    assert not rebuilt
    assert [r for r, _s in hits] == [1]
    assert "«Nathanael»" in hits[0][1]
    # umlaut-insensitive through diacritic folding
    hits, _ = search_records(vol, "TESTVOL", "Hubner", db_path=db)
    assert [r for r, _s in hits] == [2]
    assert search_records(vol, "TESTVOL", "zzz-no-match", db_path=db)[0] == []
    assert search_records(vol, "TESTVOL", "   ", db_path=db)[0] == []


def test_decode_single_word():
    # <len=5>"Werke"<00>
    buf = b"\x05Werke\x00"
    toks = decode_tokens(buf)
    assert ("word", "Werke") in toks
    assert decode_record_content(buf) == "Werke"


def test_decode_masked_length():
    # Newer discs set a 0x80 high bit on length bytes: 0x83 + 3 letters.
    assert decode_record_content(b"\x83was\x00") == "was"
    assert decode_record_content(b"\x87Kindern\x00") == "Kindern"
    # Mixed masked + plain lengths in one stream.
    assert decode_record_content(b"\x83was\x01\x04Welt\x00") == "was Welt"


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


def test_content_region_xml_marker():
    # DB074 records carry .xml markers.
    body = b"\x05Werke\x00"
    rec = b"\x13\x11volumehead\x0f\x01" + body + b"#q:\\digibib\\db74\\texte\\wbw-0.xml\x03"
    region = DigibibVolume._content_region(rec)
    assert b"#q:" not in region
    assert b"xml" not in region
    assert decode_record_content(region) == "Werke"


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


@pytest.mark.skipif(not _have_discs(), reason="no Digibib volumes under DIGIBIB_ROOT")
def test_live_db008_node_for_record():
    vol = DigibibLibrary().open("DB008")
    assert vol.node_for_record(2071).index == 87  # Werke 'Der Sandmann'
    assert vol.node_for_record(0).index == 0  # volume root
    assert vol.node_for_record(292).index == 43  # Hoertext 'Der Sandmann'


@pytest.mark.skipif(not _have_discs(), reason="no Digibib volumes under DIGIBIB_ROOT")
def test_live_db008_search():
    vol = DigibibLibrary().open("DB008")
    hits = vol.search("Nathanael", limit=50)
    assert hits
    recs = [h["record"] for h in hits]
    assert any(2071 <= r < 2131 for r in recs)  # Sandmann chapter hit
    assert any("«Nathanael»" in h["snippet"] for h in hits)
    assert all(h["chapter"] for h in hits)  # every hit resolves to a chapter
    dev = vol.search("Devrient")
    assert any(h["record"] in (290, 291) for h in dev)


@pytest.mark.skipif(not _have_discs(), reason="no Digibib volumes under DIGIBIB_ROOT")
def test_live_db008_last_record():
    # The final record must decode (sentinel end), and the last chapter which
    # spans it must not crash node_text.
    vol = DigibibLibrary().open("DB008")
    last = vol.record_count - 1
    assert isinstance(vol.record_text(last), str)
    text = vol.node_text(len(vol.toc_flat) - 1)
    assert isinstance(text, str)


@pytest.mark.skipif(not _have_discs(), reason="no Digibib volumes under DIGIBIB_ROOT")
def test_live_db074_toc_and_mapping():
    # Newer-disc layout: lowercase files, variant-B TEXT.DKI, direct DKA table.
    vol = DigibibLibrary().open("DB074")
    assert len(vol.toc_flat) == 2508
    assert vol.record_count == 5881
    assert vol.toc_flat[1].record == 3  # 'Einführung' heading record
    assert vol.toc_flat[117].record == 477  # 'Max und Moritz'
    assert vol.toc_flat[0].record == 2  # root skips binary preamble
    text = vol.node_text(117)
    assert "Moritz" in text
    assert "Streichen" in text


@pytest.mark.skipif(not _have_discs(), reason="no Digibib volumes under DIGIBIB_ROOT")
def test_live_db008_images():
    vol = DigibibLibrary().open("DB008")
    assert vol.image_levels() == [1, 2, 3, 4]
    figs = vol.images(1)
    assert len(figs) == 53
    f92 = next(f for f in figs if f["name"] == "0092.BMP")
    assert (f92["width"], f92["height"], f92["bpp"]) == (100, 79, 8)
    assert vol.image_bytes(1, "0092.BMP")[:2] == b"BM"
    node = vol.node_for_record(5)  # Wittkop monograph, refs 0092.bmp
    assert node is not None
    assert "0092.BMP" in vol.node_image_refs(node.index)
