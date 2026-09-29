"""Persistent key-value store for rule caches (#9).

Rule sets keep hot caches in memory; this SQLite file lets what matters survive a restart and
be shared by several worker processes on the same host: finished rule signals per video and
bot-block cooldowns (so one blocked worker makes the others back off too).

Never raises: a broken or locked file degrades to memory-only caching with a warning.
One host only -- several servers need a network store (e.g. Redis) behind the same get/set.
"""
from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Optional

log = logging.getLogger(__name__)


class SqliteStore:
    def __init__(self, path: Path | str, timeout: float = 1.0):
        self.path = Path(path)
        self._lock = threading.Lock()
        self._db: Optional[sqlite3.Connection] = None
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            db = sqlite3.connect(self.path, timeout=timeout, check_same_thread=False,
                                 isolation_level=None)
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL,"
                       " expires_at REAL NOT NULL)")
            db.execute("DELETE FROM kv WHERE expires_at < ?", (time.time(),))
            self._db = db
        except (sqlite3.Error, OSError):
            log.warning("rule store %s unavailable; using memory only", self.path, exc_info=True)

    def get(self, key: str) -> Optional[Any]:
        """Value stored under key, or None if missing, expired or unreadable."""
        if self._db is None:
            return None
        try:
            with self._lock:
                row = self._db.execute("SELECT value, expires_at FROM kv WHERE key = ?",
                                       (key,)).fetchone()
            if row is None or row[1] < time.time():
                return None
            return json.loads(row[0])
        except (sqlite3.Error, ValueError):
            log.warning("rule store read failed", exc_info=True)
            return None

    def ttl_left(self, key: str) -> float:
        """Seconds until key expires (0 if missing)."""
        if self._db is None:
            return 0.0
        try:
            with self._lock:
                row = self._db.execute("SELECT expires_at FROM kv WHERE key = ?",
                                       (key,)).fetchone()
        except sqlite3.Error:
            return 0.0
        return max(0.0, row[0] - time.time()) if row else 0.0

    def set(self, key: str, value: Any, ttl: float) -> None:
        if self._db is None:
            return
        try:
            data = json.dumps(value, ensure_ascii=False)
            with self._lock:
                self._db.execute("INSERT OR REPLACE INTO kv (key, value, expires_at)"
                                 " VALUES (?, ?, ?)", (key, data, time.time() + ttl))
        except (sqlite3.Error, TypeError, ValueError):
            log.warning("rule store write failed", exc_info=True)

    def close(self) -> None:
        if self._db is not None:
            with self._lock:
                self._db.close()
            self._db = None
