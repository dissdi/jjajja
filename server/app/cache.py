"""Result cache keyed by (platform, video_id) or upload sha256, plus a config version.

In-process dict backed by JSON files under <cache_dir>/results so a restart keeps results
(avoids re-hitting YouTube / re-running models). Single-process only.
"""
from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)


class ResultCache:
    def __init__(self, directory: Path, max_items: int = 4096):
        self.dir = Path(directory) / "results"
        self.dir.mkdir(parents=True, exist_ok=True)
        self.max_items = max_items
        self._mem: dict[str, tuple[float, dict]] = {}
        self._lock = threading.Lock()

    @staticmethod
    def make_key(kind: str, ident: str, version: str) -> str:
        return f"{kind}:{ident}:{version}"

    def _path(self, key: str) -> Path:
        return self.dir / (hashlib.sha1(key.encode()).hexdigest() + ".json")

    def get(self, key: str) -> Optional[dict]:
        now = time.time()
        with self._lock:
            hit = self._mem.get(key)
        if hit is None:
            p = self._path(key)
            if p.exists():
                try:
                    rec = json.loads(p.read_text(encoding="utf-8"))
                    hit = (float(rec["expires_at"]), rec["body"])
                except Exception:
                    hit = None
        if hit is None:
            return None
        if hit[0] < now:
            self.delete(key)
            return None
        with self._lock:
            self._mem[key] = hit
        return dict(hit[1])

    def set(self, key: str, body: dict, ttl_s: float) -> None:
        exp = time.time() + ttl_s
        with self._lock:
            if len(self._mem) >= self.max_items:
                self._mem.pop(next(iter(self._mem)))
            self._mem[key] = (exp, body)
        try:
            self._path(key).write_text(json.dumps({"key": key, "expires_at": exp, "body": body},
                                                  ensure_ascii=False), encoding="utf-8")
        except OSError:
            log.warning("cache write failed", exc_info=True)

    def delete(self, key: str) -> None:
        with self._lock:
            self._mem.pop(key, None)
        try:
            self._path(key).unlink(missing_ok=True)
        except OSError:
            pass

    def clear(self) -> None:
        with self._lock:
            self._mem.clear()
        for p in self.dir.glob("*.json"):
            p.unlink(missing_ok=True)
