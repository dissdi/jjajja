"""Short-link resolution (#7). The network is an httpx.MockTransport; `hits` records every
request so the tests can also prove which hosts were never contacted."""
import asyncio

import httpx
import pytest

from rules import (InvalidUrl, LinkUnresolved, Normalized, UnsupportedPlatform, resolve)
from rules import shorturl

VID = "jzE0Rcb2hY4"
YT = Normalized("youtube", VID, f"https://www.youtube.com/watch?v={VID}")


@pytest.fixture(autouse=True)
def _clear():
    shorturl.clear_cache()
    yield
    shorturl.clear_cache()


def client(routes: dict, hits: list):
    """routes: url -> httpx.Response (or callable returning one). Unknown url -> 404."""
    async def handler(req: httpx.Request):
        url = str(req.url)
        hits.append((req.method, url))
        r = routes.get(url)
        if callable(r):
            r = await r(req)
        return r if r is not None else httpx.Response(404)
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def moved(location: str, status: int = 301):
    return httpx.Response(status, headers={"location": location})


def page(body: str):
    return httpx.Response(200, headers={"content-type": "text/html; charset=utf-8"},
                          content=body.encode())


async def go(text, routes, hits=None, timeout=5.0):
    hits = [] if hits is None else hits
    async with client(routes, hits) as c:
        return await resolve(text, c, timeout)


# ------------------------------------------------------------------ follows to YouTube
@pytest.mark.parametrize("text", [
    "https://bit.ly/3abcDEF",
    "bit.ly/3abcDEF",
    "https://www.bit.ly/3abcDEF",
    # KakaoTalk / YouTube-app share strings around the link
    "[YouTube] 고양이 올림픽 다이빙 🐱\nhttps://bit.ly/3abcDEF",
    "이거 AI래요 ㅋㅋ https://bit.ly/3abcDEF 한번 보세요",
    "보세요https://bit.ly/3abcDEF영상",
])
async def test_bitly_to_youtube(text):
    routes = {"https://bit.ly/3abcDEF": moved(f"https://youtu.be/{VID}?si=abc")}
    if text.startswith("https://www."):
        routes = {"https://www.bit.ly/3abcDEF": routes["https://bit.ly/3abcDEF"]}
    hits = []
    assert await go(text, routes, hits) == YT
    assert [m for m, _ in hits] == ["GET"] and len(hits) == 1


@pytest.mark.parametrize("status", [301, 302, 303, 307, 308])
async def test_redirect_statuses(status):
    routes = {"https://kko.to/aB3dE": moved(f"https://youtube.com/shorts/{VID}", status)}
    assert await go("https://kko.to/aB3dE", routes) == YT


async def test_chain_of_shorteners():
    hits = []
    routes = {
        "https://kko.to/x1": moved("https://bit.ly/y2"),
        "https://bit.ly/y2": moved(f"https://m.youtube.com/shorts/{VID}?feature=share"),
    }
    assert await go("https://kko.to/x1", routes, hits) == YT
    assert [u for _, u in hits] == ["https://kko.to/x1", "https://bit.ly/y2"]


async def test_relative_location():
    routes = {"https://han.gl/abc": moved("/go/abc"),
              "https://han.gl/go/abc": moved(f"https://youtu.be/{VID}")}
    assert await go("https://han.gl/abc", routes) == YT


@pytest.mark.parametrize("body", [
    f'<html><head><meta http-equiv="refresh" content="0; url=https://youtu.be/{VID}"></head></html>',
    f"<meta content='0;URL=https://youtu.be/{VID}' http-equiv='Refresh'>",
    f'<meta property="og:url" content="https://www.youtube.com/watch?v={VID}&amp;feature=share">',
])
async def test_html_interstitial(body):
    assert await go("https://naver.me/AbCd", {"https://naver.me/AbCd": page(body)}) == YT


# ------------------------------------------------------------------ no network needed
@pytest.mark.parametrize("text,exc", [
    (f"https://youtube.com/shorts/{VID}", None),
    ("https://www.tiktok.com/@user/video/7300000000000000000", UnsupportedPlatform),
    ("https://bit.ly.evil.io/abc", UnsupportedPlatform),   # look-alike host is not a shortener
    ("안녕하세요", InvalidUrl),
])
async def test_no_request_without_shortener(text, exc):
    hits = []
    if exc is None:
        assert await go(text, {}, hits) == YT
    else:
        with pytest.raises(exc):
            await go(text, {}, hits)
    assert hits == []


async def test_cached_second_time():
    hits = []
    routes = {"https://bit.ly/c": moved(f"https://youtu.be/{VID}")}
    assert await go("https://bit.ly/c", routes, hits) == YT
    assert await go("https://bit.ly/c", routes, hits) == YT
    assert len(hits) == 1


# ------------------------------------------------------------------ never fetch other hosts
@pytest.mark.parametrize("target", [
    "https://n.news.naver.com/article/001/0000000001",   # real but unsupported site
    "http://127.0.0.1:8000/v1/health",                   # internal address (SSRF)
    "http://169.254.169.254/latest/meta-data/",
])
async def test_non_shortener_target_is_not_fetched(target):
    hits = []
    with pytest.raises(UnsupportedPlatform):
        await go("https://bit.ly/n", {"https://bit.ly/n": moved(target)}, hits)
    assert [u for _, u in hits] == ["https://bit.ly/n"]


async def test_target_youtube_without_id_is_invalid():
    with pytest.raises(InvalidUrl):
        await go("https://bit.ly/ch", {"https://bit.ly/ch": moved("https://www.youtube.com/@chan")})


# ------------------------------------------------------------------ cannot be followed
async def test_dead_link():
    with pytest.raises(LinkUnresolved):
        await go("https://bit.ly/dead", {})


async def test_no_location_or_plain_page():
    routes = {"https://bit.ly/a": httpx.Response(301),
              "https://bit.ly/b": page("<html><body>광고</body></html>")}
    for u in routes:
        with pytest.raises(LinkUnresolved):
            await go(u, routes)


async def test_loop():
    routes = {"https://bit.ly/a": moved("https://tinyurl.com/b"),
              "https://tinyurl.com/b": moved("https://bit.ly/a")}
    with pytest.raises(LinkUnresolved, match="loop"):
        await go("https://bit.ly/a", routes)


async def test_too_many_hops():
    n = shorturl.MAX_HOPS + 2
    routes = {f"https://bit.ly/h{i}": moved(f"https://bit.ly/h{i+1}") for i in range(n)}
    hits = []
    with pytest.raises(LinkUnresolved, match="redirects"):
        await go("https://bit.ly/h0", routes, hits)
    assert len(hits) == shorturl.MAX_HOPS


async def test_non_http_scheme():
    with pytest.raises(LinkUnresolved):
        await go("https://bit.ly/j", {"https://bit.ly/j": moved("javascript:alert(1)")})


async def test_network_error():
    async def boom(req):
        raise httpx.ConnectError("down", request=req)
    with pytest.raises(LinkUnresolved):
        await go("https://bit.ly/e", {"https://bit.ly/e": boom})


async def test_timeout():
    async def slow(req):
        await asyncio.sleep(5)
        return moved(f"https://youtu.be/{VID}")
    with pytest.raises(LinkUnresolved, match="timed out"):
        await go("https://bit.ly/s", {"https://bit.ly/s": slow}, timeout=0.2)


async def test_no_client_or_budget():
    with pytest.raises(LinkUnresolved):
        await resolve("https://bit.ly/x", None, 5.0)
    async with client({}, []) as c:
        with pytest.raises(LinkUnresolved):
            await resolve("https://bit.ly/x", c, 0.0)
