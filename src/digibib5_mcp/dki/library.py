"""DigibibLibrary - discover the installed CD-ROM volumes on disk.

The Digitale Bibliothek volumes live under a root like
``K:\\Digitale Bibliothek\\Bibliothek`` as per-volume folders ``DB008`` etc.,
each containing a ``data\\`` folder (the actual volume). This scans that root
and exposes the volume list for the CD picker.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .volume import DigibibVolume

# Default install root on the Goliath server. Override via DIGIBIB_ROOT env or
# the DigibibLibrary(root=...) argument.
DEFAULT_ROOT = r"K:\Digitale Bibliothek\Bibliothek"


def _config_dir() -> Path:
    override = os.environ.get("DIGIBIB_CACHE_DIR")
    if override:
        return Path(override)
    return Path(__file__).resolve().parents[3] / "data"


def library_config_path() -> Path:
    return _config_dir() / "library.json"


def load_library_config() -> dict[str, Any]:
    path = library_config_path()
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def save_library_config(root: str | None = None, onboarded: bool | None = None) -> dict[str, Any]:
    cfg = load_library_config()
    if root is not None:
        cleaned = root.strip()
        if cleaned:
            cfg["root"] = cleaned
        else:
            cfg.pop("root", None)
    if onboarded is not None:
        cfg["onboarded"] = bool(onboarded)
    path = library_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    os.replace(tmp, path)
    return cfg


def resolve_library_root(explicit_root: str | Path | None = None) -> tuple[str, str]:
    """Return (root_path, source) where source is explicit|saved|env|default."""
    if explicit_root is not None and str(explicit_root).strip():
        return str(explicit_root).strip(), "explicit"
    cfg = load_library_config()
    saved = cfg.get("root")
    if isinstance(saved, str) and saved.strip():
        return saved.strip(), "saved"
    env_root = os.environ.get("DIGIBIB_ROOT", "").strip()
    if env_root:
        return env_root, "env"
    return DEFAULT_ROOT, "default"


@dataclass
class VolumeRef:
    id: str  # folder name, e.g. "DB008"
    data_dir: str  # absolute path to the data folder
    title: str  # from DIGIBIB.TXT Caption, else the id


class DigibibLibrary:
    def __init__(self, root: str | Path | None = None):
        resolved, _ = resolve_library_root(root)
        self.root = Path(resolved)

    def _find_data_dir(self, vol_dir: Path) -> Path | None:
        """A volume folder contains a data folder (named 'data', sometimes other
        casings). Return it, or None if this is not a volume."""
        for name in ("data", "DATA", "Data"):
            d = vol_dir / name
            if d.is_dir() and (d / "DIGIBIB.TXT").exists() or (d / "digibib.txt").exists():
                return d
        # fallback: any immediate subdir holding DIGIBIB.TXT
        if vol_dir.is_dir():
            for d in vol_dir.iterdir():
                if d.is_dir() and any((d / n).exists() for n in ("DIGIBIB.TXT", "digibib.txt")):
                    return d
        return None

    def list_volumes(self) -> list[VolumeRef]:
        refs: list[VolumeRef] = []
        if not self.root.is_dir():
            return refs
        for vol_dir in sorted(self.root.iterdir()):
            if not vol_dir.is_dir():
                continue
            data = self._find_data_dir(vol_dir)
            if data is None:
                continue
            title = vol_dir.name
            try:
                title = DigibibVolume(data).title
            except Exception:
                pass
            refs.append(VolumeRef(id=vol_dir.name, data_dir=str(data), title=title))
        return refs

    def open(self, volume_id: str) -> DigibibVolume:
        for ref in self.list_volumes():
            if ref.id.lower() == volume_id.lower():
                return DigibibVolume(ref.data_dir)
        raise KeyError(f"Volume not found: {volume_id}")
