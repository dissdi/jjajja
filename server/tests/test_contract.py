"""Contract conformance for /v1/health and /v1/detect (JSON + multipart). No network."""
from __future__ import annotations

import contextlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.pipeline as pipeline_mod
from app.main import create_app
from app.pipeline import Pipeline
from rules import RuleSignal
from tests.helpers import FakeFetcher, assert_contract_body, assert_error, base_settings

URL = "https://youtube.com/shorts/jzE0Rcb2hY4?si=abc"

CREATOR = RuleSignal(id="yt_creator_ai_disclosure", score=0.95, weight=3.0,
                     evidence_ko="올린 사람이 유튜브에 'AI로 만든 영상'이라고 밝혔어요")
C2PA = RuleSignal(id="yt_c2pa_ai_label", decisive=True, score=1.0, weight=1.0,
                  evidence_ko="영상에 남은 제작 기록에 구글 AI로 만들었다고 나와요")
NO_LABEL = RuleSignal(id="yt_no_ai_label", score=0.5, weight=0.0,
                      evidence_ko="유튜브에 AI로 만들었다는 표시는 없어요")
NO_SELF = RuleSignal(id="yt_self_report_ai", score=0.5, weight=0.0,
                     evidence_ko="영상 제목과 설명에 AI 표시는 없어요")
SELF_STRONG = RuleSignal(id="yt_self_report_ai", score=0.85, weight=1.5,
                         evidence_ko="영상 제목에 AI로 만들었다는 표시가 있어요")


@contextlib.contextmanager
def client(tmp_path: Path, monkeypatch, rules=(), fetch="blocked", **kw):
    calls = []

    async def fake_rules(n, http):
        calls.append(n)
        return list(rules)

    monkeypatch.setattr(pipeline_mod, "extract_signals", fake_rules)
    s = base_settings(tmp_path, **kw)
    pipe = Pipeline(s, fetcher=FakeFetcher(fetch))
    with TestClient(create_app(s, pipe)) as c:
        c.rule_calls = calls
        c.pipe = pipe
        yield c


# ---------------------------------------------------------------- health
def test_health(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        r = c.get("/v1/health")
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "ok" and j["detectors"] == {"mock": "ok"}
    assert j["limits"] == {"max_upload_mb": 50.0, "max_duration_s": 180.0}


def test_health_reports_unloadable_detector_down(tmp_path, monkeypatch):
    import detectors

    def boom(cfg, device):
        raise OSError("weights missing")

    monkeypatch.setitem(detectors.FACTORIES, "d3", boom)
    with client(tmp_path, monkeypatch, rules=[NO_LABEL], detectors=["d3"]) as c:
        assert c.get("/v1/health").json()["detectors"] == {"mock": "ok", "d3": "down"}
        body = c.post("/v1/detect", json={"url": URL}).json()
    d3 = next(s for s in body["signals"] if s["id"] == "d3")
    assert d3["status"] == "unavailable" and d3["score"] is None and d3["evidence_ko"]


# ---------------------------------------------------------------- URL errors
@pytest.mark.parametrize("payload", [{"url": "안녕하세요"}, {"url": ""}, {"nope": 1}, [1, 2]])
def test_invalid_url(tmp_path, monkeypatch, payload):
    with client(tmp_path, monkeypatch) as c:
        assert_error(c.post("/v1/detect", json=payload), 400, "invalid_url")


def test_invalid_body(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        r = c.post("/v1/detect", content=b"not json", headers={"content-type": "application/json"})
        assert_error(r, 400, "invalid_url")


def test_unsupported_platform(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        assert_error(c.post("/v1/detect", json={"url": "https://example.com/video/1"}), 422,
                     "unsupported_platform")


# ---------------------------------------------------------------- URL path, video blocked
def test_url_blocked_rules_only_is_partial(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch, rules=[CREATOR, NO_SELF]) as c:
        r = c.post("/v1/detect", json={"url": URL, "source": "share"})
    assert r.status_code == 200, r.text
    b = r.json()
    assert_contract_body(b)
    assert b["platform"] == "youtube" and b["video_id"] == "jzE0Rcb2hY4"
    assert b["partial"] is True and b["cached"] is False
    assert b["ai_probability"] == 0.95 and b["verdict"] == "likely_ai"
    mock = next(s for s in b["signals"] if s["id"] == "mock")
    assert mock["status"] == "unavailable" and "받아오지 못해" in mock["evidence_ko"]


def test_url_decisive_c2pa(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch, rules=[C2PA, NO_SELF]) as c:
        b = c.post("/v1/detect", json={"url": URL}).json()
    assert_contract_body(b)
    assert b["verdict"] == "likely_ai" and b["ai_probability"] >= 0.95


def test_url_no_usable_signal_is_unknown(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch, rules=[NO_LABEL, NO_SELF]) as c:
        b = c.post("/v1/detect", json={"url": URL}).json()
    assert_contract_body(b)
    assert b["ai_probability"] is None and b["verdict"] == "unknown" and b["partial"] is True


def test_url_self_report_alone_capped_to_uncertain(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch, rules=[NO_LABEL, SELF_STRONG]) as c:
        b = c.post("/v1/detect", json={"url": URL}).json()
    assert b["ai_probability"] == 0.74 and b["verdict"] == "uncertain"


def test_url_private_video_404(tmp_path, monkeypatch):
    unavailable = RuleSignal(id="yt_ai_label", status="unavailable", score=None)
    with client(tmp_path, monkeypatch, rules=[unavailable], fetch="unavailable") as c:
        assert_error(c.post("/v1/detect", json={"url": URL}), 404, "video_unavailable")


def test_url_private_video_with_rule_signal_is_partial_200(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch, rules=[CREATOR], fetch="unavailable") as c:
        r = c.post("/v1/detect", json={"url": URL})
    assert r.status_code == 200 and r.json()["partial"] is True


# ---------------------------------------------------------------- URL path, video fetched
def test_url_fetched_runs_models(tmp_path, monkeypatch, sample_video):
    with client(tmp_path, monkeypatch, rules=[NO_LABEL, NO_SELF], fetch=sample_video) as c:
        b = c.post("/v1/detect", json={"url": URL}).json()
    assert_contract_body(b)
    assert b["partial"] is False
    # uncalibrated model alone is floored at 0.40 (floor_without_strong) -> uncertain
    assert b["ai_probability"] == 0.4 and b["verdict"] == "uncertain"
    mock = next(s for s in b["signals"] if s["id"] == "mock")
    assert mock == {"id": "mock", "kind": "model", "status": "ok", "decisive": False, "score": 0.2,
                    "weight": 1.0, "evidence_ko": mock["evidence_ko"], "via": "model",
                    "present": None}


def test_url_cache_hit(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch, rules=[CREATOR]) as c:
        a = c.post("/v1/detect", json={"url": URL}).json()
        b = c.post("/v1/detect", json={"url": "https://youtu.be/jzE0Rcb2hY4"}).json()
        fetch_calls = c.pipe.fetcher.calls
    assert a["cached"] is False and b["cached"] is True
    assert a["request_id"] != b["request_id"] and a["analyzed_at"] == b["analyzed_at"]
    assert len(c.rule_calls) == 1 and fetch_calls == 1  # no repeat request to the platform
    assert_contract_body(b)


# ---------------------------------------------------------------- upload path
def _upload(c, path: Path, name="clip.mp4"):
    with open(path, "rb") as f:
        return c.post("/v1/detect", files={"file": (name, f, "video/mp4")}, data={"source": "upload"})


def test_upload_ok_and_cached(tmp_path, monkeypatch, sample_video):
    with client(tmp_path, monkeypatch) as c:
        a = _upload(c, sample_video)
        b = _upload(c, sample_video, name="renamed.mp4")
    assert a.status_code == 200, a.text
    a, b = a.json(), b.json()
    assert_contract_body(a)
    assert a["platform"] == "upload" and a["video_id"] is None and a["partial"] is False
    assert a["verdict"] == "uncertain" and not a["cached"] and b["cached"]  # model-only floor


def test_upload_too_large_413(tmp_path, monkeypatch, sample_video):
    with client(tmp_path, monkeypatch, max_upload_bytes=100 * 1024) as c:
        assert_error(_upload(c, sample_video), 413, "file_too_large")


def test_upload_too_long_413(tmp_path, monkeypatch, long_video):
    with client(tmp_path, monkeypatch) as c:
        assert_error(_upload(c, long_video), 413, "file_too_large")


def test_upload_not_a_video(tmp_path, monkeypatch):
    junk = tmp_path / "x.mp4"
    junk.write_bytes(b"hello, this is not a video" * 100)
    with client(tmp_path, monkeypatch) as c:
        assert_error(_upload(c, junk), 400, "invalid_file")


def test_upload_missing_file_field(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        r = c.post("/v1/detect", data={"source": "upload"}, files={"other": ("a", b"x")})
        assert_error(r, 400, "invalid_file")


def test_upload_all_detectors_down_503(tmp_path, monkeypatch, sample_video):
    with client(tmp_path, monkeypatch, enable_mock=False) as c:
        assert_error(_upload(c, sample_video), 503, "detectors_down")


# ---------------------------------------------------------------- misc
def test_rate_limited(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch, rules=[CREATOR], rate_limit_per_min=2) as c:
        for _ in range(2):
            assert c.post("/v1/detect", json={"url": URL}).status_code == 200
        assert_error(c.post("/v1/detect", json={"url": URL}), 429, "rate_limited")


def test_openapi_lists_endpoints(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        paths = c.get("/openapi.json").json()["paths"]
    assert "/v1/detect" in paths and "/v1/health" in paths


# ---------------------------------------------------------------- contract v1.2: present (#2)
CONTRACT_MD = Path(__file__).resolve().parents[2] / ".claude/skills/detect-api-contract/SKILL.md"


def _contract_example() -> dict:
    import json
    import re
    text = CONTRACT_MD.read_text(encoding="utf-8")
    block = re.search(r"응답 `200`:\s*```json\n(.*?)```", text, re.S).group(1)
    # the example uses "a | b" placeholders inside strings only, so it is valid JSON
    return json.loads(block)


@pytest.mark.skipif(not CONTRACT_MD.exists(), reason="contract skill not in this checkout")
def test_contract_example_keys_match_schema():
    from app.schemas import DetectResponse, Signal
    from tests.helpers import CONTRACT_RESPONSE_KEYS, CONTRACT_SIGNAL_KEYS
    ex = _contract_example()
    assert set(ex) == CONTRACT_RESPONSE_KEYS == set(DetectResponse.model_fields)
    # v1.3 `debug` is a dev-mode-only optional field: in the schema, not in the example
    assert set(ex["signals"][0]) == CONTRACT_SIGNAL_KEYS == set(Signal.model_fields) - {"debug"}


def _with_present(sig: RuleSignal, present):
    """RuleSignal may or may not carry `present` yet (rules/ is owned by source-rule-engineer);
    the pipeline reads it with getattr, so attach it either way."""
    import copy
    s = copy.copy(sig)
    object.__setattr__(s, "present", present)
    return s


def test_rule_present_passthrough(tmp_path, monkeypatch):
    label_on = _with_present(RuleSignal(id="yt_ai_label", decisive=True, score=1.0, weight=1.0,
                                        evidence_ko="유튜브에 'AI로 만든 콘텐츠' 표시가 있어요"), True)
    self_off = _with_present(NO_SELF, False)
    unchecked = _with_present(RuleSignal(id="yt_c2pa_ai_label", status="unavailable", score=None),
                              True)  # a rule bug: claims presence without checking
    plain = copy_without_present(NO_LABEL)
    with client(tmp_path, monkeypatch, rules=[label_on, self_off, unchecked, plain]) as c:
        r = c.post("/v1/detect", json={"url": URL})
    assert r.status_code == 200, r.text
    b = r.json()
    assert_contract_body(b)
    by = {s["id"]: s for s in b["signals"]}
    assert by["yt_ai_label"]["present"] is True
    assert by["yt_self_report_ai"]["present"] is False
    assert by["yt_c2pa_ai_label"]["present"] is None   # status != ok -> null
    assert by["yt_no_ai_label"]["present"] is None     # rule did not say -> null
    assert by["mock"]["present"] is None               # models: always null


def copy_without_present(sig: RuleSignal):
    import copy
    s = copy.copy(sig)
    if "present" in getattr(s, "__dict__", {}):
        object.__setattr__(s, "present", None)
    return s


def test_present_key_serialized_even_from_old_cache_entries(tmp_path, monkeypatch):
    """Bodies cached before v1.2 have no `present`; the response must still carry it (null)."""
    with client(tmp_path, monkeypatch, rules=[CREATOR]) as c:
        c.post("/v1/detect", json={"url": URL})
        for k, (exp, body) in list(c.pipe.cache._mem.items()):
            for s in body["signals"]:
                s.pop("present", None)
        b = c.post("/v1/detect", json={"url": URL}).json()
    assert b["cached"] is True
    assert all(s["present"] is None for s in b["signals"])
    assert_contract_body(b)
