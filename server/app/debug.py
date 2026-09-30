"""Development-mode signal diagnostics (contract v1.3 `signals[].debug`, JJAJJA_DEBUG=1).

Every signal may carry an internal `debug` dict {reason, raw} built by the registry / rules.
This module is the single choke point before it reaches a client:
  * `sanitize()` redacts secrets (API keys, Authorization/Bearer, cookies) and shrinks `raw` to
    a small summary (scalars + short lists, few keys, short strings).
  * `finalize()` keeps it (debug on) or removes the key entirely (debug off). Results are cached
    WITHOUT debug (`strip()`); a cache hit in debug mode gets reason "cached result".
"""
from __future__ import annotations

import os
import re
from typing import Any, Optional

REASON_MAX = 200
STR_MAX = 120
RAW_MAX_KEYS = 12
LIST_MAX = 8
CACHED = "cached result"

_SECRET_ENV = re.compile(r"(KEY|TOKEN|SECRET|PASSWORD|COOKIE|AUTH)", re.I)
_PATTERNS = [
    (re.compile(r"(?i)\b(bearer|basic|token)\s+[A-Za-z0-9._~+/=-]{6,}"), r"\1 ***"),
    (re.compile(r"(?i)(authorization|proxy-authorization)\s*[:=]\s*[^\s,;]+(\s+[^\s,;]+)?"), r"\1: ***"),
    (re.compile(r"(?i)((?:set-)?cookie)\s*[:=]\s*[^\n]*"), r"\1: ***"),
    (re.compile(r"(?i)((?:api[_-]?key|access[_-]?token|secret|password|sessionid|sid)\s*[\"']?\s*[:=]\s*[\"']?)[^\s\"'&,;}]+"),
     r"\1***"),
]


def _secret_values() -> list[str]:
    out = []
    for k, v in os.environ.items():
        if _SECRET_ENV.search(k) and v and len(v.strip()) >= 6:
            out.append(v.strip())
    return sorted(out, key=len, reverse=True)


def redact(text: Any, secrets: Optional[list[str]] = None) -> str:
    s = str(text)
    for v in (secrets if secrets is not None else _secret_values()):
        s = s.replace(v, "***")
    for pat, rep in _PATTERNS:
        s = pat.sub(rep, s)
    return s


def _small(v: Any, secrets: list[str]) -> Any:
    if v is None or isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return round(v, 4) if isinstance(v, float) else v
    if isinstance(v, str):
        return redact(v, secrets)[:STR_MAX]
    if isinstance(v, (list, tuple)):
        return [_small(x, secrets) for x in list(v)[:LIST_MAX] if not isinstance(x, (dict, list))]
    return redact(repr(v), secrets)[:STR_MAX]  # nested objects are not summaries


def sanitize(debug: Optional[dict]) -> dict:
    secrets = _secret_values()
    debug = debug or {}
    reason = debug.get("reason")
    if reason is not None:
        reason = " ".join(redact(reason, secrets).split())[:REASON_MAX] or None
    raw = debug.get("raw")
    if isinstance(raw, dict) and raw:
        raw = {str(k)[:40]: _small(v, secrets) for k, v in list(raw.items())[:RAW_MAX_KEYS]
               if not isinstance(v, dict)}
    else:
        raw = None
    return {"reason": reason, "raw": raw or None}


def strip(signals: list[dict]) -> list[dict]:
    return [{k: v for k, v in s.items() if k != "debug"} for s in signals]


def finalize(signals: list[dict], enabled: bool, cached: bool = False) -> list[dict]:
    if not enabled:
        return strip(signals)
    out = []
    for s in signals:
        s = dict(s)
        s["debug"] = ({"reason": CACHED, "raw": None} if cached
                      else sanitize(s.get("debug")))
        out.append(s)
    return out
