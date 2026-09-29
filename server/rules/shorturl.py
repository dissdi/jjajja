"""Short links (bit.ly, kko.to, naver.me ...) -> the platform URL they point to (GitHub #7).

KakaoTalk group chats often carry shortened links. `normalize` alone rejects them as
`unsupported_platform`, so `resolve_with` follows the redirect chain and normalizes the target.

Safety (the text comes straight from users):
  * Only hosts in SHORTENERS are ever requested. A redirect target is normalized first and is
    fetched again only if it is itself a shortener, so a pasted link can never make the server
    call an arbitrary address (SSRF) -- not even the platform itself.
  * At most MAX_HOPS requests, redirect loops stop, and the whole resolution shares one timeout.
  * Bodies are read only for 200 HTML interstitials (meta refresh / og:url), capped at _BODY_LIMIT.
"""
from __future__ import annotations

import asyncio
import html
import logging
import re
from collections import OrderedDict
from typing import TYPE_CHECKING, Iterable, Optional
from urllib.parse import urljoin, urlsplit

from .base import LinkUnresolved, Normalized, RuleSet, UnsupportedPlatform
from .normalize import _candidates, normalize_with

if TYPE_CHECKING:  # pragma: no cover
    import httpx

log = logging.getLogger(__name__)

# Public URL shorteners seen in Korean chats. Exact host match (plus "www."); add new ones here.
SHORTENERS = frozenset({
    "bit.ly", "kko.to", "naver.me", "me2.do", "han.gl", "vo.la", "url.kr",
    "tinyurl.com", "t.co", "goo.gl", "is.gd",
})
MAX_HOPS = 5
_REDIRECT = {301, 302, 303, 307, 308}
_BODY_LIMIT = 64 * 1024
# Some shorteners show a bot page to non-browser clients.
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/126.0 Mobile Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
}
_META_TAG = re.compile(r"<meta\b[^>]*>", re.IGNORECASE)
_ATTR = re.compile(r"""([A-Za-z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))""")
_REFRESH_URL = re.compile(r"url\s*=\s*['\"]?([^'\"]+)", re.IGNORECASE)

# short URL -> final URL text; resolved links do not change, so repeats never hit the network.
_CACHE: "OrderedDict[str, str]" = OrderedDict()
_CACHE_MAX = 1024


def clear_cache() -> None:
    _CACHE.clear()


def is_shortener(url: str) -> bool:
    host = (urlsplit(url).hostname or "").lower()
    return host.removeprefix("www.") in SHORTENERS


def _html_target(page: str) -> Optional[str]:
    """Target of a 200 HTML interstitial: meta refresh first, then og:url."""
    refresh = og = None
    for tag in _META_TAG.findall(page):
        a = {k.lower(): (v1 or v2 or v3) for k, v1, v2, v3 in _ATTR.findall(tag)}
        if refresh is None and a.get("http-equiv", "").lower() == "refresh":
            m = _REFRESH_URL.search(a.get("content", ""))
            refresh = m.group(1).strip() if m else None
        if og is None and a.get("property", "").lower() == "og:url" and a.get("content"):
            og = a["content"].strip()
    target = refresh or og
    return html.unescape(target) if target else None


async def _hop(url: str, client: "httpx.AsyncClient") -> Optional[str]:
    """One request to a shortener. Returns the next URL (maybe relative) or None."""
    req = client.build_request("GET", url, headers=_HEADERS)
    r = await client.send(req, stream=True, follow_redirects=False)
    try:
        if r.status_code in _REDIRECT:
            return r.headers.get("location")
        if r.status_code == 200 and "html" in r.headers.get("content-type", "").lower():
            body = bytearray()
            async for chunk in r.aiter_bytes():
                body += chunk
                if len(body) >= _BODY_LIMIT:
                    break
            return _html_target(bytes(body[:_BODY_LIMIT]).decode("utf-8", "replace"))
        return None
    finally:
        await r.aclose()


async def _follow(url: str, rulesets: list[RuleSet], client: "httpx.AsyncClient") -> str:
    """Follow redirects from a shortener until a URL some RuleSet accepts. Returns that URL."""
    import httpx

    seen: set[str] = set()
    for _ in range(MAX_HOPS):
        if url in seen:
            raise LinkUnresolved(f"redirect loop at {url}")
        seen.add(url)
        try:
            nxt = await _hop(url, client)
        # InvalidURL is not an HTTPError: httpx raises it for a malformed Location header
        except (httpx.HTTPError, httpx.InvalidURL) as e:
            raise LinkUnresolved(f"{url}: {type(e).__name__}") from e
        if not nxt:
            raise LinkUnresolved(f"{url}: no redirect target")
        nxt = urljoin(url, nxt.strip())
        if urlsplit(nxt).scheme.lower() not in ("http", "https"):
            raise LinkUnresolved(f"{url}: non-http target")
        try:
            normalize_with(nxt, rulesets)
            return nxt
        except UnsupportedPlatform:
            if not is_shortener(nxt):
                raise  # a real site we do not support (news article, blog ...)
        url = nxt
    raise LinkUnresolved(f"more than {MAX_HOPS} redirects")


async def resolve_with(text: str, rulesets: Iterable[RuleSet],
                       client: Optional["httpx.AsyncClient"], timeout: float) -> Normalized:
    """Like normalize_with, but short links are followed to the platform URL.

    Raises InvalidUrl / UnsupportedPlatform like normalize_with, and LinkUnresolved when a
    short link could not be followed. No network call unless the text holds a shortener link.
    """
    rulesets = list(rulesets)
    try:
        return normalize_with(text, rulesets)
    except UnsupportedPlatform:
        shorts = [u for u in _candidates(text.strip()) if is_shortener(u)]
        if not shorts:
            raise
    short = shorts[0]
    target = _CACHE.get(short)
    if target is None:
        if client is None or timeout <= 0:
            raise LinkUnresolved(f"{short}: no time or client to follow")
        try:
            target = await asyncio.wait_for(_follow(short, rulesets, client), timeout)
        except asyncio.TimeoutError as e:
            raise LinkUnresolved(f"{short}: timed out after {timeout:.1f}s") from e
        except UnsupportedPlatform as e:
            log.info("short link %s -> unsupported site %s", short, e)
            raise
        _CACHE[short] = target
        if len(_CACHE) > _CACHE_MAX:
            _CACHE.popitem(last=False)
    else:
        _CACHE.move_to_end(short)
    log.info("short link %s -> %s", short, target)
    return normalize_with(target, rulesets)
