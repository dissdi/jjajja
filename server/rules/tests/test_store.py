"""Persistent rule store (#9): restarts and several workers share signals and bot-block
cooldowns. A "restart" / "other worker" is simulated by dropping the in-memory caches and
opening a new SqliteStore on the same file."""
import httpx
import pytest

from conftest import load_fixture
from rules import Normalized, RuleSignal, extract_signals, use_store
from rules import youtube as yt
from rules.store import SqliteStore

VID = "jzE0Rcb2hY4"
N = Normalized("youtube", VID, yt.canonical_url(VID))


def restart(path):
    """New process on the same host: empty memory, same store file."""
    yt.FETCHER.clear()
    yt.FETCHER.min_interval = 0.0
    use_store(path)


def counting(handler):
    calls = []

    def h(req):
        calls.append(req.url.path)
        return handler(req)
    return h, calls


def innertube_ok(req):
    if req.url.path == "/youtubei/v1/next":
        return httpx.Response(200, json=load_fixture("next_c2pa_ai_jzE0Rcb2hY4.json"))
    return httpx.Response(404)


async def extract(handler, n=N):
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
        return await extract_signals(n, c)


# ---------------------------------------------------------------- SqliteStore
def test_store_roundtrip_and_expiry(tmp_path):
    s = SqliteStore(tmp_path / "r.sqlite3")
    s.set("a", {"x": [1, "한글"]}, 60)
    s.set("old", 1, -1)
    assert s.get("a") == {"x": [1, "한글"]}
    assert s.get("old") is None and s.get("missing") is None
    assert 0 < s.ttl_left("a") <= 60 and s.ttl_left("old") == 0.0


def test_store_shared_between_instances(tmp_path):
    a, b = SqliteStore(tmp_path / "r.sqlite3"), SqliteStore(tmp_path / "r.sqlite3")
    a.set("k", "v", 60)
    assert b.get("k") == "v"


def test_store_never_raises_on_bad_path(tmp_path):
    (tmp_path / "file").write_text("x")
    s = SqliteStore(tmp_path / "file" / "r.sqlite3")  # parent is a file -> cannot open
    s.set("k", "v", 60)
    assert s.get("k") is None and s.ttl_left("k") == 0.0


def test_store_unserializable_value_is_skipped(tmp_path):
    s = SqliteStore(tmp_path / "r.sqlite3")
    s.set("k", object(), 60)
    assert s.get("k") is None


# ---------------------------------------------------------------- signals survive a restart
@pytest.mark.asyncio
async def test_signals_survive_restart(tmp_path):
    path = tmp_path / "rules.sqlite3"
    restart(path)
    h, calls = counting(innertube_ok)
    first = await extract(h)
    assert calls == ["/youtubei/v1/next"]

    restart(path)
    again = await extract(h)
    assert calls == ["/youtubei/v1/next"]  # no second YouTube call
    assert [s.to_dict() for s in again] == [s.to_dict() for s in first]
    assert {s.id for s in again} >= {"yt_c2pa_ai_label"}


@pytest.mark.asyncio
async def test_unavailable_signals_are_not_persisted(tmp_path):
    path = tmp_path / "rules.sqlite3"
    restart(path)
    h, calls = counting(lambda req: httpx.Response(500))
    sigs = await extract(h)
    assert any(s.status == "unavailable" for s in sigs)
    n_first = len(calls)

    restart(path)
    await extract(h)
    assert len(calls) == 2 * n_first  # retried after restart, not served from the store


@pytest.mark.asyncio
async def test_incompatible_stored_signals_are_ignored(tmp_path):
    path = tmp_path / "rules.sqlite3"
    restart(path)
    yt.FETCHER.store.set(f"youtube:signals:{VID}", [{"id": "x", "unknown_field": 1}], 60)
    h, calls = counting(innertube_ok)
    sigs = await extract(h)
    assert calls == ["/youtubei/v1/next"] and all(isinstance(s, RuleSignal) for s in sigs)


# ---------------------------------------------------------------- bot-block shared by workers
@pytest.mark.asyncio
async def test_block_is_shared_with_other_worker(tmp_path):
    path = tmp_path / "rules.sqlite3"
    restart(path)
    await extract(lambda req: httpx.Response(429))  # worker A: every endpoint blocked

    restart(path)  # worker B on the same host
    h, calls = counting(innertube_ok)
    sigs = await extract(h, Normalized("youtube", "V_EPw46kMrk", yt.canonical_url("V_EPw46kMrk")))
    assert calls == []  # B backs off instead of hitting YouTube during A's cooldown
    assert {s.status for s in sigs} == {"unavailable"}


@pytest.mark.asyncio
async def test_memory_only_without_store():
    assert yt.FETCHER.store is None  # conftest clears it; tests and tools stay in memory
    h, calls = counting(innertube_ok)
    await extract(h)
    yt.FETCHER.clear()
    yt.FETCHER.min_interval = 0.0
    await extract(h)
    assert calls == ["/youtubei/v1/next", "/youtubei/v1/next"]
