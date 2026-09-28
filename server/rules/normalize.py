"""Share-string / URL -> Normalized(platform, video_id, canonical_url)."""
from __future__ import annotations

import re
from typing import Iterable
from urllib.parse import urlsplit

from .base import InvalidUrl, Normalized, RuleSet, UnsupportedPlatform

# ASCII URL characters only, so Korean text glued to the link ("...?si=x영상보세요") is cut off.
_URL_CHARS = r"[A-Za-z0-9\-._~:/?#\[\]@!$&'*+,;=%]"
_SCHEME_URL = re.compile(r"https?://" + _URL_CHARS + "+", re.IGNORECASE)
# Bare links without scheme, e.g. "youtu.be/abc" or "m.youtube.com/shorts/abc".
_BARE_URL = re.compile(
    r"(?<![A-Za-z0-9.\-/@])((?:[A-Za-z0-9\-]+\.)+[A-Za-z]{2,}/" + _URL_CHARS + "*)"
)
_TRAILING = ".,;:!?'\")]}>"


def _candidates(text: str) -> list[str]:
    found = [m.group(0) for m in _SCHEME_URL.finditer(text)]
    if not found:
        found = ["https://" + m.group(1) for m in _BARE_URL.finditer(text)]
    return [u.rstrip(_TRAILING) for u in found]


def normalize_with(text: str, rulesets: Iterable[RuleSet]) -> Normalized:
    if not isinstance(text, str) or not text.strip():
        raise InvalidUrl("empty input")
    rulesets = list(rulesets)
    cands = _candidates(text.strip())
    if not cands:
        raise InvalidUrl("no url found")
    first_err: InvalidUrl | None = None
    for url in cands:
        try:
            parts = urlsplit(url)
        except ValueError:
            continue
        if not parts.hostname:
            continue
        for rs in rulesets:
            try:
                vid = rs.match(parts)
            except InvalidUrl as e:
                first_err = first_err or e
                continue
            if vid:
                return Normalized(rs.platform, vid, rs.canonical_url(vid))
    if first_err is not None:
        raise first_err
    raise UnsupportedPlatform(urlsplit(cands[0]).hostname or cands[0])
