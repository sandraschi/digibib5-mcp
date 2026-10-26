"""DKI format library for Digitale Bibliothek 5 volumes.

Reverse-engineered; see reversing-mcp/docs/DIGIBIB5_DKI_FORMAT.md. The text
codec is v1/approximate (codec.py). Public API:

    from digibib5_mcp.dki import DigibibLibrary, DigibibVolume

    lib = DigibibLibrary()                 # scans the install root
    for ref in lib.list_volumes(): ...
    vol = lib.open("DB008")
    vol.title                              # "Digitale Bibliothek Band 8: Hoffmann"
    vol.toc_tree()                         # nested TocNode forest
    vol.node_text(node_index)              # decoded text for a TOC node
"""

from .codec import decode_record_content, decode_tokens, render_text
from .library import DigibibLibrary, VolumeRef
from .volume import DigibibVolume, TocNode

__all__ = [
    "DigibibLibrary",
    "VolumeRef",
    "DigibibVolume",
    "TocNode",
    "decode_tokens",
    "render_text",
    "decode_record_content",
]
