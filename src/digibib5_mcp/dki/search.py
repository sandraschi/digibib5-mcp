"""Full-text search over decoded volume text (SQLite FTS5 sidecar).

Rationale: the native INDEX.* files are only partly mapped (per-record
offset tables in INDEX.TTX/LINKS.TTX verified; lexicon <-> posting pairing,
HTX/SHX/SWX roles not yet). Searching the *decoded* text instead guarantees
hits match exactly what the reader displays.

First search for a volume decodes all records (~8 s for DB008's 5974) and
caches FTS documents in ``data/search.db`` (invalidated by TEXT.DKI
mtime+size); repeat queries are instant.
"""

from __future__ import annotations

import os
import sqlite3
import time
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .volume import DigibibVolume

_SCHEMA = """
CREATE TABLE IF NOT EXISTS docs(
  volume_id TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (volume_id, record_id));
CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
  text, content='docs', content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER IF NOT EXISTS docs_ai AFTER INSERT ON docs BEGIN
  INSERT INTO docs_fts(rowid, text) VALUES (new.rowid, new.text);
END;
CREATE TRIGGER IF NOT EXISTS docs_ad AFTER DELETE ON docs BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
END;
CREATE TABLE IF NOT EXISTS meta(
  volume_id TEXT PRIMARY KEY,
  text_mtime REAL NOT NULL,
  text_size INTEGER NOT NULL,
  built_at REAL NOT NULL);
"""


def _db_path() -> Path:
    override = os.environ.get("DIGIBIB_CACHE_DIR")
    if override:
        return Path(override) / "search.db"
    repo_root = Path(__file__).resolve().parents[3]
    return repo_root / "data" / "search.db"


def _text_source(volume: DigibibVolume) -> Path:
    return volume._path("TEXT.DKI")


def ensure_built(volume: DigibibVolume, volume_id: str, db_path: Path | None = None) -> bool:
    """(Re)build the FTS index for a volume if missing or stale.

    Returns True when a (re)build happened (first search is slow).
    """
    db = db_path or _db_path()
    db.parent.mkdir(parents=True, exist_ok=True)
    src = _text_source(volume)
    st = src.stat()
    con = sqlite3.connect(db)
    try:
        con.executescript(_SCHEMA)
        row = con.execute("SELECT text_mtime, text_size FROM meta WHERE volume_id = ?", (volume_id,)).fetchone()
        if row is not None and row[0] == st.st_mtime and row[1] == st.st_size:
            return False
        con.execute("DELETE FROM docs WHERE volume_id = ?", (volume_id,))
        batch = [(volume_id, r, volume.record_text(r)) for r in range(volume.record_count)]
        con.executemany("INSERT INTO docs(volume_id, record_id, text) VALUES (?, ?, ?)", batch)
        con.execute(
            "INSERT OR REPLACE INTO meta(volume_id, text_mtime, text_size, built_at) VALUES (?, ?, ?, ?)",
            (volume_id, st.st_mtime, st.st_size, time.time()),
        )
        con.commit()
        return True
    finally:
        con.close()


def _run(con: sqlite3.Connection, volume_id: str, query: str, limit: int) -> list[tuple[int, str]]:
    return con.execute(
        "SELECT d.record_id, snippet(docs_fts, 0, '«', '»', ' … ', 12)"
        " FROM docs_fts JOIN docs d ON d.rowid = docs_fts.rowid"
        " WHERE docs_fts MATCH ? AND d.volume_id = ?"
        " ORDER BY rank LIMIT ?",
        (query, volume_id, limit),
    ).fetchall()


def search_records(
    volume: DigibibVolume,
    volume_id: str,
    query: str,
    limit: int = 20,
    db_path: Path | None = None,
) -> tuple[list[tuple[int, str]], bool]:
    """Search decoded record texts. Returns ([(record_id, snippet)], rebuilt)."""
    query = (query or "").strip()
    if not query:
        return [], False
    limit = max(1, min(limit, 100))
    rebuilt = ensure_built(volume, volume_id, db_path)
    con = sqlite3.connect(db_path or _db_path())
    try:
        try:
            rows = _run(con, volume_id, query, limit)
        except sqlite3.OperationalError:
            # Raw FTS5 syntax failed (e.g. unbalanced quotes): AND plain terms.
            terms = [w for w in query.split() if w.strip('*"')]
            if not terms:
                return [], rebuilt
            rows = _run(con, volume_id, " AND ".join(f'"{w}"' for w in terms), limit)
        return [(r, s) for r, s in rows], rebuilt
    finally:
        con.close()
