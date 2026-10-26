"""DKI codec unit tests (no disc required) + optional live-volume smoke test.

The codec tests are synthetic and always run. The live test runs only when a
real volume is present under DIGIBIB_ROOT (e.g. on the Goliath server with the
discs mounted), so CI without the discs still passes.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from digibib5_mcp.dki import DigibibLibrary, decode_record_content, decode_tokens


def test_decode_single_word():
    # <len=5>"Werke"<00>
    buf = b"\x05Werke\x00"
    toks = decode_tokens(buf)
    assert ("word", "Werke") in toks
    assert decode_record_content(buf) == "Werke"


def test_decode_words_with_break():
    buf = b"\x03von\x00\x02\x07Mathias\x00"
    text = decode_record_content(buf)
    assert "von" in text and "Mathias" in text
    assert "\n" in text  # 0x02 produced a break


def test_attached_punctuation():
    # "Bertram." - inline '.' after the 7 letters
    buf = b"\x07Bertram.\x00"
    assert decode_record_content(buf) == "Bertram."


def test_cp1252_umlaut():
    # "Hörtext" with 0xf6 = ö
    buf = b"\x07H\xf6rtext\x00"
    assert decode_record_content(buf) == "Hörtext"


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
