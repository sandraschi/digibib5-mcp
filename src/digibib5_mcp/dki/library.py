"""DigibibLibrary - discover the installed CD-ROM volumes on disk.

The Digitale Bibliothek volumes live under a root like
``K:\\Digitale Bibliothek\\Bibliothek`` as per-volume folders ``DB008`` etc.,
each containing a ``data\\`` folder (the actual volume). This scans that root
and exposes the volume list for the CD picker.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .volume import DigibibVolume

# Default install root on the Goliath server. Override via DIGIBIB_ROOT env or
# the DigibibLibrary(root=...) argument.
DEFAULT_ROOT = r"K:\Digitale Bibliothek\Bibliothek"


@dataclass
class VolumeRef:
    id: str  # folder name, e.g. "DB008"
    data_dir: str  # absolute path to the data folder
    title: str  # from DIGIBIB.TXT Caption, else the id


class DigibibLibrary:
    def __init__(self, root: str | Path | None = None):
        import os

        self.root = Path(root or os.environ.get("DIGIBIB_ROOT", DEFAULT_ROOT))

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
