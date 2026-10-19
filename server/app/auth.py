"""Accounts, per-device tokens and check history (contract v2.0, #20). Standard library only.

Storage: one SQLite file (default <cache_dir>/auth.sqlite3), separate from the result cache.
  users    (id, email UNIQUE, pw_hash, created_at)
  devices  (id, user_id, token_hash UNIQUE, device_name, created_at, last_used_at, expires_at)
           -- one row per login ("기기별 토큰"). Logout deletes the row. Expired rows are purged.
  history  (seq, id, user_id, device_id, device_name, checked_at, source, platform, video_id,
            url, verdict, ai_probability) -- account level: every device of the user sees all rows.

Secrets:
  * passwords: hashlib.scrypt (n=2**14, r=8, p=1, 16-byte random salt, 32-byte key),
    encoded "scrypt$n$r$p$salt$key"; compared with hmac.compare_digest. Unknown e-mails still pay
    one scrypt so login timing does not reveal whether an account exists.
  * tokens: secrets.token_urlsafe(32) handed to the client once; the DB keeps sha256(token) only.
    Valid 30 days from login, never extended on use.
  * Neither passwords nor tokens are ever logged or returned except the token in the
    signup/login response body. Video files are never stored here.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
import sqlite3
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional

SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_DKLEN = 2 ** 14, 8, 1, 32
PASSWORD_MIN, PASSWORD_MAX = 8, 1024
EMAIL_MAX = 254
DEVICE_NAME_MAX = 60
DEFAULT_DEVICE_NAME = "이름 없는 기기"
URL_MAX = 2048
HISTORY_LIMIT_DEFAULT, HISTORY_LIMIT_MAX = 20, 50
SOURCES = {"paste", "share", "clipboard", "upload"}
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s.]{2,}$")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    pw_hash TEXT NOT NULL,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    device_name TEXT NOT NULL,
    created_at REAL NOT NULL,
    last_used_at REAL NOT NULL,
    expires_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS devices_user ON devices(user_id);
CREATE TABLE IF NOT EXISTS history (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id TEXT,
    device_name TEXT NOT NULL,
    checked_at REAL NOT NULL,
    source TEXT,
    platform TEXT NOT NULL,
    video_id TEXT,
    url TEXT,
    verdict TEXT NOT NULL,
    ai_probability REAL
);
CREATE INDEX IF NOT EXISTS history_user_seq ON history(user_id, seq DESC);
"""


class AuthError(Exception):
    """`code` is a contract error code (invalid_email, weak_password, email_taken,
    invalid_credentials, unauthorized, not_found)."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class Session:
    user_id: str
    email: str
    user_created_at: float
    device_id: str
    device_name: str


def iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def normalize_email(email) -> str:
    if not isinstance(email, str):
        raise AuthError("invalid_email")
    e = email.strip().lower()
    if len(e) > EMAIL_MAX or not _EMAIL_RE.match(e):
        raise AuthError("invalid_email")
    return e


def check_password(password) -> str:
    if not isinstance(password, str) or not (PASSWORD_MIN <= len(password) <= PASSWORD_MAX):
        raise AuthError("weak_password")
    return password


def hash_password(password: str, salt: Optional[bytes] = None) -> str:
    salt = salt or secrets.token_bytes(16)
    key = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P,
                         dklen=SCRYPT_DKLEN, maxmem=64 * 1024 * 1024)
    b64 = lambda b: base64.b64encode(b).decode("ascii")  # noqa: E731
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${b64(salt)}${b64(key)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algo, n, r, p, salt, key = encoded.split("$")
        if algo != "scrypt":
            return False
        want = base64.b64decode(key)
        got = hashlib.scrypt(password.encode("utf-8"), salt=base64.b64decode(salt), n=int(n),
                             r=int(r), p=int(p), dklen=len(want), maxmem=64 * 1024 * 1024)
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(got, want)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _clean_name(name) -> str:
    if not isinstance(name, str):
        return DEFAULT_DEVICE_NAME
    name = " ".join(name.split())[:DEVICE_NAME_MAX]
    return name or DEFAULT_DEVICE_NAME


def _encode_cursor(seq: int) -> str:
    return base64.urlsafe_b64encode(f"h{seq}".encode()).decode().rstrip("=")


def _decode_cursor(cursor: str) -> Optional[int]:
    try:
        raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)).decode()
        if raw.startswith("h") and raw[1:].isdigit():
            return int(raw[1:])
    except (ValueError, UnicodeDecodeError):
        pass
    return None


class AuthStore:
    def __init__(self, path: Path, token_ttl_s: float = 30 * 24 * 3600.0,
                 now: Callable[[], float] = time.time):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.token_ttl_s = token_ttl_s
        self.now = now
        self._lock = threading.Lock()
        self._db = sqlite3.connect(str(self.path), check_same_thread=False, isolation_level=None)
        self._db.row_factory = sqlite3.Row
        with self._lock:
            self._db.execute("PRAGMA foreign_keys=ON")
            self._db.execute("PRAGMA journal_mode=WAL")
            self._db.executescript(_SCHEMA)
        # spent on unknown e-mails so a miss costs the same as a wrong password
        self._dummy_hash = hash_password(secrets.token_urlsafe(16))

    def close(self) -> None:
        with self._lock:
            self._db.close()

    # ------------------------------------------------------------ accounts
    def signup(self, email, password, device_name=None) -> tuple[str, dict]:
        """-> (token, user). Blocking (scrypt): call from a worker thread."""
        email = normalize_email(email)
        password = check_password(password)
        with self._lock:
            if self._db.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
                raise AuthError("email_taken")
        pw = hash_password(password)
        uid, now = str(uuid.uuid4()), self.now()
        with self._lock:
            try:
                self._db.execute("INSERT INTO users(id, email, pw_hash, created_at) VALUES (?,?,?,?)",
                                 (uid, email, pw, now))
            except sqlite3.IntegrityError:  # raced with another signup
                raise AuthError("email_taken")
        token = self._new_device(uid, device_name)
        return token, self._user_dict(uid, email, now)

    def login(self, email, password, device_name=None) -> tuple[str, dict]:
        """-> (token, user) or AuthError('invalid_credentials'). Blocking (scrypt)."""
        try:
            email = normalize_email(email)
        except AuthError:
            email = None
        if not isinstance(password, str) or len(password) > PASSWORD_MAX:
            password = None
        row = None
        if email is not None:
            with self._lock:
                row = self._db.execute("SELECT id, email, pw_hash, created_at FROM users WHERE email=?",
                                       (email,)).fetchone()
        ok = verify_password(password or "", row["pw_hash"] if row else self._dummy_hash)
        if not (ok and row is not None and password is not None):
            raise AuthError("invalid_credentials")
        token = self._new_device(row["id"], device_name)
        return token, self._user_dict(row["id"], row["email"], row["created_at"])

    def _new_device(self, user_id: str, device_name) -> str:
        token = secrets.token_urlsafe(32)
        now = self.now()
        with self._lock:
            self._db.execute("DELETE FROM devices WHERE user_id=? AND expires_at<=?", (user_id, now))
            self._db.execute(
                "INSERT INTO devices(id, user_id, token_hash, device_name, created_at, last_used_at,"
                " expires_at) VALUES (?,?,?,?,?,?,?)",
                (str(uuid.uuid4()), user_id, token_hash(token), _clean_name(device_name), now, now,
                 now + self.token_ttl_s))
        return token

    @staticmethod
    def _user_dict(uid: str, email: str, created_at: float) -> dict:
        return {"id": uid, "email": email, "created_at": iso(created_at)}

    # ------------------------------------------------------------ tokens
    def authenticate(self, token: Optional[str]) -> Session:
        """Valid, unexpired token -> Session (touches last_used_at, does not extend expiry)."""
        if not token:
            raise AuthError("unauthorized")
        th, now = token_hash(token), self.now()
        with self._lock:
            row = self._db.execute(
                "SELECT d.id AS did, d.device_name, d.expires_at, u.id AS uid, u.email, u.created_at"
                " FROM devices d JOIN users u ON u.id=d.user_id WHERE d.token_hash=?",
                (th,)).fetchone()
            if row is None:
                raise AuthError("unauthorized")
            if row["expires_at"] <= now:
                self._db.execute("DELETE FROM devices WHERE id=?", (row["did"],))
                raise AuthError("unauthorized")
            self._db.execute("UPDATE devices SET last_used_at=? WHERE id=?", (now, row["did"]))
        return Session(row["uid"], row["email"], row["created_at"], row["did"], row["device_name"])

    def logout(self, session: Session) -> None:
        with self._lock:
            self._db.execute("DELETE FROM devices WHERE id=?", (session.device_id,))

    def me(self, session: Session) -> dict:
        now = self.now()
        with self._lock:
            rows = self._db.execute(
                "SELECT id, device_name, last_used_at FROM devices WHERE user_id=? AND expires_at>?"
                " ORDER BY last_used_at DESC", (session.user_id, now)).fetchall()
        return {
            "user": self._user_dict(session.user_id, session.email, session.user_created_at),
            "devices": [{"id": r["id"], "device_name": r["device_name"],
                         "last_used_at": iso(r["last_used_at"]),
                         "current": r["id"] == session.device_id} for r in rows],
        }

    # ------------------------------------------------------------ history
    def add_history(self, session: Session, body: dict, source, url: Optional[str]) -> str:
        """Record one successful /v1/detect answer (cache hits included). Stores only the
        verdict summary and the original input address -- never the video, never the token."""
        hid = str(uuid.uuid4())
        src = source if source in SOURCES else None
        if url is not None:
            url = str(url).strip()[:URL_MAX] or None
        with self._lock:
            self._db.execute(
                "INSERT INTO history(id, user_id, device_id, device_name, checked_at, source,"
                " platform, video_id, url, verdict, ai_probability) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (hid, session.user_id, session.device_id, session.device_name, self.now(), src,
                 body["platform"], body.get("video_id"), url, body["verdict"],
                 body.get("ai_probability")))
        return hid

    def list_history(self, session: Session, limit=None, before: Optional[str] = None) -> dict:
        try:
            n = int(limit) if limit not in (None, "") else HISTORY_LIMIT_DEFAULT
        except (TypeError, ValueError):
            n = HISTORY_LIMIT_DEFAULT
        n = max(1, min(HISTORY_LIMIT_MAX, n))
        q = ("SELECT seq, id, checked_at, source, platform, video_id, url, verdict, ai_probability,"
             " device_name FROM history WHERE user_id=?")
        args: list = [session.user_id]
        if before:
            seq = _decode_cursor(before)
            if seq is None:  # unreadable cursor: end of list rather than restarting (no loops)
                return {"items": [], "next": None}
            q += " AND seq<?"
            args.append(seq)
        q += " ORDER BY seq DESC LIMIT ?"
        args.append(n + 1)
        with self._lock:
            rows = self._db.execute(q, args).fetchall()
        more = len(rows) > n
        rows = rows[:n]
        items = [{"id": r["id"], "checked_at": iso(r["checked_at"]), "source": r["source"],
                  "platform": r["platform"], "video_id": r["video_id"], "url": r["url"],
                  "verdict": r["verdict"], "ai_probability": r["ai_probability"],
                  "device_name": r["device_name"]} for r in rows]
        return {"items": items, "next": _encode_cursor(rows[-1]["seq"]) if more else None}

    def delete_history(self, session: Session, history_id: str) -> None:
        with self._lock:
            cur = self._db.execute("DELETE FROM history WHERE id=? AND user_id=?",
                                   (history_id, session.user_id))
        if cur.rowcount == 0:
            raise AuthError("not_found")  # someone else's record looks exactly like a missing one
