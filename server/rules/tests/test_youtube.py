import json

import httpx
import pytest

from conftest import load_fixture
from rules import Normalized, RuleSignal, extract_signals, normalize
from rules import youtube as yt

FX = {
    "c2pa_ai": ("next_c2pa_ai_jzE0Rcb2hY4.json", "jzE0Rcb2hY4"),
    "creator": ("next_creator_disclosure_kaVmpWPnE5s.json", "kaVmpWPnE5s"),
    "camera": ("next_camera_gfjgRHtDa38.json", "gfjgRHtDa38"),
    "auto_dub": ("next_auto_dub_1nzjMOuDasQ.json", "1nzjMOuDasQ"),
    "no_label": ("next_no_label_u5TpxWFZ1vM.json", "u5TpxWFZ1vM"),
}


def by_id(sigs):
    return {s.id: s for s in sigs}


def mock_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def innertube_handler(calls):
    def handler(req: httpx.Request):
        calls.append(req.url.path)
        if req.url.path == "/youtubei/v1/next":
            vid = json.loads(req.content)["videoId"]
            for fname, fvid in FX.values():
                if fvid == vid:
                    return httpx.Response(200, json=load_fixture(fname))
        return httpx.Response(404)
    return handler


async def run(key):
    fname, vid = FX[key]
    calls = []
    async with mock_client(innertube_handler(calls)) as c:
        sigs = await extract_signals(normalize(f"https://youtube.com/shorts/{vid}"), c)
    return sigs, calls


def assert_contract(sigs):
    for s in sigs:
        assert isinstance(s, RuleSignal) and s.kind == "rule"
        assert s.status in ("ok", "error", "unavailable")
        assert s.via in ("api", "oembed", "html")
        if s.status == "ok":
            assert s.evidence_ko.strip(), s  # UX: evidence even for negative signals
            assert s.score is not None and 0.0 <= s.score <= 1.0
            assert isinstance(s.present, bool), s  # contract v1.2: ok rule -> True/False
        else:
            assert s.present is None, s
        assert "present" in s.to_dict()


def presence(sigs):
    return {s.id: s.present for s in sigs}


# ---------------------------------------------------------------- fixture-based extraction
@pytest.mark.asyncio
async def test_c2pa_ai_label_is_decisive():
    sigs, calls = await run("c2pa_ai")
    assert_contract(sigs)
    s = by_id(sigs)
    lab = s["yt_c2pa_ai_label"]
    assert lab.decisive and lab.score == 1.0 and lab.via == "api"
    assert "구글" in lab.evidence_ko
    assert "yt_no_ai_label" not in s
    assert s["yt_self_report_ai"].score > 0.5  # "AI Veo 3 Kids Shorts"
    assert calls == ["/youtubei/v1/next"]
    assert presence(sigs) == {"yt_c2pa_ai_label": True, "yt_self_report_ai": True}


@pytest.mark.asyncio
async def test_creator_disclosure_strong_not_decisive():
    sigs, _ = await run("creator")
    assert_contract(sigs)
    s = by_id(sigs)
    d = s["yt_creator_ai_disclosure"]
    assert not d.decisive and d.score >= 0.9 and d.weight > 1
    assert "yt_c2pa_ai_label" not in s
    assert s["yt_self_report_ai"].score > 0.5  # title "... #ai동물 #shorts"
    assert "제목" in s["yt_self_report_ai"].evidence_ko
    assert presence(sigs) == {"yt_creator_ai_disclosure": True, "yt_self_report_ai": True}


@pytest.mark.asyncio
async def test_camera_capture_points_to_real():
    sigs, _ = await run("camera")
    assert_contract(sigs)
    s = by_id(sigs)
    cam = s["yt_c2pa_camera"]
    assert cam.score <= 0.1 and not cam.decisive and cam.weight > 1
    assert "카메라" in cam.evidence_ko
    assert not any(x.decisive for x in sigs)
    assert s["yt_self_report_ai"].weight == 0.0
    # camera record found (present=True) is NOT an AI mark; self-report absent
    assert presence(sigs) == {"yt_c2pa_camera": True, "yt_self_report_ai": False}


@pytest.mark.asyncio
async def test_auto_dub_is_not_ai():
    sigs, _ = await run("auto_dub")
    assert_contract(sigs)
    s = by_id(sigs)
    assert "yt_c2pa_ai_label" not in s and "yt_creator_ai_disclosure" not in s
    assert not any(x.decisive for x in sigs)
    assert s["yt_no_ai_label"].weight == 0.0
    # title is an "AI 영상 만드는 법" tutorial -> must not count as strong self report
    assert s["yt_self_report_ai"].score < 0.85 or s["yt_self_report_ai"].weight <= 0.5
    # auto-dub section is not an AI label -> no_label present=False; tutorial title still
    # contains an AI self-report phrase -> present=True (weight keeps it weak)
    assert presence(sigs) == {"yt_no_ai_label": False, "yt_self_report_ai": True}


@pytest.mark.asyncio
async def test_no_label_negative_evidence():
    sigs, _ = await run("no_label")
    assert_contract(sigs)
    s = by_id(sigs)
    assert set(s) == {"yt_no_ai_label", "yt_self_report_ai"}
    assert s["yt_no_ai_label"].evidence_ko == "유튜브에 AI로 만들었다는 표시는 없어요"
    assert s["yt_no_ai_label"].weight == 0.0
    assert s["yt_self_report_ai"].weight == 0.0
    assert "없어요" in s["yt_self_report_ai"].evidence_ko
    # yt_no_ai_label.present answers "is there an AI label?" -> False (not "absence found")
    assert presence(sigs) == {"yt_no_ai_label": False, "yt_self_report_ai": False}


def test_parser_reads_answer_ids():
    p = yt.parse_initial_data(load_fixture(FX["auto_dub"][0]))
    assert [x.answer_id for x in p.sections] == [yt.ANSWER_AUTODUB]
    assert p.ai_badge is False  # auto-dub badge label is "자동 더빙", not "AI"
    p = yt.parse_initial_data(load_fixture(FX["creator"][0]))
    assert p.ai_badge is True and p.sections[0].attribution == ""
    p = yt.parse_initial_data(load_fixture(FX["c2pa_ai"][0]))
    assert p.sections[0].attribution.endswith("Google LLC")


def test_english_attribution_and_unknown_signer():
    p = yt.Parsed(sections=[yt.Section(yt.ANSWER_AI, "Made with AI", "Info from OpenAI")])
    lab = by_id(yt.label_signals(p, "api"))["yt_c2pa_ai_label"]
    assert "오픈AI" in lab.evidence_ko
    p = yt.Parsed(sections=[yt.Section(yt.ANSWER_AI, "Made with AI", "Info from Acme Labs")])
    lab = by_id(yt.label_signals(p, "api"))["yt_c2pa_ai_label"]
    assert lab.decisive and lab.evidence_ko == "영상에 남은 제작 기록에 AI로 만들었다고 나와요"


def test_unrecognized_payload_is_not_no_label():
    assert yt.parse_initial_data({"responseContext": {}}) is None
    assert yt.parse_initial_data("<html>") is None


# ---------------------------------------------------------------- network behaviour (mocked)
@pytest.mark.asyncio
async def test_cache_avoids_second_call():
    calls = []
    n = normalize("https://youtu.be/jzE0Rcb2hY4")
    async with mock_client(innertube_handler(calls)) as c:
        a = await extract_signals(n, c)
        b = await extract_signals(n, c)
    assert calls == ["/youtubei/v1/next"]
    assert [x.to_dict() for x in a] == [x.to_dict() for x in b]


@pytest.mark.asyncio
async def test_blocked_falls_back_to_oembed_title():
    calls = []

    def handler(req):
        calls.append(req.url.path)
        if req.url.path == "/youtubei/v1/next":
            return httpx.Response(429)
        if req.url.path == "/watch":
            return httpx.Response(302, headers={"location": "https://www.google.com/sorry/index"})
        if req.url.path == "/oembed":
            return httpx.Response(200, json={"title": "AI로 만든 고양이 다이빙 #AI영상"})
        return httpx.Response(404)

    async with mock_client(handler) as c:
        sigs = await extract_signals(Normalized("youtube", "VrHWVzk1bo0",
                                                "https://www.youtube.com/watch?v=VrHWVzk1bo0"), c)
        # cooldown: second video must not hit innertube/html again
        await extract_signals(Normalized("youtube", "V_EPw46kMrk",
                                         "https://www.youtube.com/watch?v=V_EPw46kMrk"), c)
    assert_contract(sigs)
    s = by_id(sigs)
    assert s["yt_ai_label"].status == "unavailable"
    assert s["yt_self_report_ai"].via == "oembed" and s["yt_self_report_ai"].score > 0.5
    assert "제목" in s["yt_self_report_ai"].evidence_ko
    assert presence(sigs) == {"yt_ai_label": None, "yt_self_report_ai": True}
    assert calls == ["/youtubei/v1/next", "/watch", "/oembed", "/oembed"]


@pytest.mark.asyncio
async def test_html_fallback_parses_initial_data():
    data = load_fixture(FX["c2pa_ai"][0])
    html = "<html><script>var ytInitialData = " + json.dumps(data) + ";</script></html>"

    def handler(req):
        if req.url.path == "/youtubei/v1/next":
            return httpx.Response(500)
        return httpx.Response(200, text=html)

    async with mock_client(handler) as c:
        sigs = await extract_signals(normalize("https://youtu.be/jzE0Rcb2hY4"), c)
    lab = by_id(sigs)["yt_c2pa_ai_label"]
    assert lab.via == "html" and lab.decisive


@pytest.mark.asyncio
async def test_never_raises_on_errors():
    def handler(req):
        if req.url.path == "/oembed":
            return httpx.Response(200, text="not json")
        raise httpx.ConnectTimeout("boom")

    async with mock_client(handler) as c:
        sigs = await extract_signals(normalize("https://youtu.be/jzE0Rcb2hY4"), c)
    assert {s.status for s in sigs} == {"unavailable"}
    assert {s.id for s in sigs} == {"yt_ai_label", "yt_self_report_ai"}
    assert presence(sigs) == {"yt_ai_label": None, "yt_self_report_ai": None}


def test_present_forced_none_when_not_ok():
    assert RuleSignal(id="x", status="unavailable", present=True).present is None
    assert RuleSignal(id="x", status="error", present=False).present is None
    assert RuleSignal(id="x", present=False).to_dict()["present"] is False


def test_oembed_title_without_ai_mark_is_present_false():
    s = yt.self_report_signals("짱절미 산책", "", "oembed", has_description=False)[0]
    assert s.present is False and s.status == "ok"


@pytest.mark.asyncio
async def test_unknown_platform_returns_empty():
    async with mock_client(lambda r: httpx.Response(500)) as c:
        assert await extract_signals(Normalized("unknown", "x", "x"), c) == []


# ---------------------------------------------------------------- client version / monitor (#9)
def vids(n):
    return [f"vid{i:08d}" for i in range(n)]  # distinct 11-char ids -> no cache hits


async def extract_many(handler, ids):
    async with mock_client(handler) as c:
        for v in ids:
            await extract_signals(Normalized("youtube", v, yt.canonical_url(v)), c)


@pytest.mark.asyncio
@pytest.mark.parametrize("env,expected", [
    (None, yt.INNERTUBE_CLIENT_VERSION),
    ("", yt.INNERTUBE_CLIENT_VERSION),
    ("  2.20261101.01.00 ", "2.20261101.01.00"),
])
async def test_innertube_client_version_from_env(monkeypatch, env, expected):
    if env is None:
        monkeypatch.delenv("JJAJJA_INNERTUBE_CLIENT_VERSION", raising=False)
    else:
        monkeypatch.setenv("JJAJJA_INNERTUBE_CLIENT_VERSION", env)
    sent = []

    def handler(req):
        if req.url.path == "/youtubei/v1/next":
            sent.append(json.loads(req.content)["context"]["client"]["clientVersion"])
            return httpx.Response(200, json=load_fixture(FX["c2pa_ai"][0]))
        return httpx.Response(404)

    await extract_many(handler, ["jzE0Rcb2hY4"])
    assert sent == [expected]


@pytest.mark.asyncio
async def test_monitor_warns_once_on_unrecognized_payloads(caplog):
    # stale client version symptom: innertube keeps answering 200 with a payload we can't read
    def handler(req):
        if req.url.path == "/youtubei/v1/next":
            return httpx.Response(200, json={"responseContext": {}})
        return httpx.Response(404)

    with caplog.at_level("WARNING", logger="rules.youtube"):
        await extract_many(handler, vids(15))
    assert yt.MONITOR.warnings["innertube"] == 1  # rate-limited, not once per call
    assert yt.MONITOR.snapshot()["innertube"] == {"calls": 15, "failures": 15}
    msgs = [r.getMessage() for r in caplog.records if "innertube failing" in r.getMessage()]
    assert len(msgs) == 1 and "JJAJJA_INNERTUBE_CLIENT_VERSION" in msgs[0]


@pytest.mark.asyncio
async def test_monitor_quiet_when_healthy_or_few_failures():
    fx = load_fixture(FX["no_label"][0])
    state = {"n": 0}

    def handler(req):
        if req.url.path == "/youtubei/v1/next":
            state["n"] += 1
            return httpx.Response(500 if state["n"] % 4 == 0 else 200, json=fx)  # 25% failing
        return httpx.Response(404)

    await extract_many(handler, vids(20))
    snap = yt.MONITOR.snapshot()["innertube"]
    assert snap["failures"] == 5 and "innertube" not in yt.MONITOR.warnings


@pytest.mark.asyncio
async def test_monitor_counts_errors_but_not_bot_blocks():
    def blocked(req):
        return httpx.Response(429)

    await extract_many(blocked, vids(3))
    assert "innertube" not in yt.MONITOR.snapshot()  # IP block: separate cooldown warning

    yt.FETCHER.clear()

    def down(req):
        raise httpx.ConnectTimeout("boom")

    await extract_many(down, vids(12))
    assert yt.MONITOR.snapshot()["innertube"] == {"calls": 12, "failures": 12}
    assert yt.MONITOR.warnings["innertube"] == 1


def test_monitor_window_recovers():
    m = yt._Monitor(window=4, min_calls=4, threshold=0.5, every=0.0)
    for ok in (False, False, False, False):
        m.record("innertube", ok)
    assert m.warnings == {"innertube": 1}
    for ok in (True, True, True):
        m.record("innertube", ok)
    m.record("innertube", False)  # 1/4 failing now -> no warning
    assert m.warnings == {"innertube": 1}
    assert m.snapshot()["innertube"] == {"calls": 4, "failures": 1}


# ---------------------------------------------------------------- self-report text rules
@pytest.mark.parametrize("title,desc,level", [
    ("AI로 제작한 고양이 춤추기", "", "strong"),
    ("고양이 생일파티 #AI영상", "", "strong"),
    ("귀여운 고양이", "#ai동물 #말하는고양이", "strong"),
    ("AI가 만든 미니어처 세계", "", "strong"),
    ("패러디 #AI콘텐츠", "", "strong"),
    ("Cat Olympics", "#aigenerated #veo3", "strong"),
    ("Google Flow Veo 3 Created THIS Video", "", "strong"),
    ("AI Cat diving", "#klingai", "strong"),
    ("AI-generated kitten", "", "strong"),
    ("강아지 산책", "#ai", "weak"),
    ("동물 인터뷰 AI 영상 무료로 만드는 법", "#AI영상", "tutorial"),
    ("짱절미가 짖는 소리 #Shorts", "#절미 #강아지 #귀여움", None),
    ("AI가 만든 가짜 영상에 속지 마세요", "YTN 뉴스", None),   # news about AI fakes
    ("[뉴스] AI 생성 딥페이크 피해 급증", "#ai", None),
    ("AI 주식 전망", "#ai뉴스 #ai주식", None),
    ("Sora의 하루 브이로그", "", None),                        # personal name, not the model
    ("aida 노래", "#aidan", None),
])
def test_self_report_classification(title, desc, level):
    hit = yt.classify_self_report(title, desc)
    assert (hit[0] if hit else None) == level
