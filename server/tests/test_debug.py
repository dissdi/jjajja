"""Dev-mode diagnostics (contract v1.3 `signals[].debug`, JJAJJA_DEBUG).

off -> the key is absent (other nulls such as `present` stay); on -> every signal has
{reason, raw}; a Hive 405 shows up as `http 405: <message>`; secrets never leak."""
from __future__ import annotations

import contextlib
import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

import app.pipeline as pipeline_mod
from app import debug as dbg
from app.main import create_app
from app.pipeline import Pipeline
from app.settings import Settings
from rules import RuleSignal
from tests.helpers import CONTRACT_SIGNAL_KEYS, FakeFetcher, assert_contract_body, base_settings

URL = "https://youtube.com/shorts/jzE0Rcb2hY4"
FAKE_KEY = "hive-secret-key-not-real-9876543210"
PAUSED = ("Your Organization is currently paused. Please contact support or update billing "
          "to resume. This message is intentionally long so that it exceeds the cut.")

NO_SELF = RuleSignal(id="yt_self_report_ai", score=0.5, weight=0.0, present=False,
                     evidence_ko="영상 제목과 설명에 AI 표시는 없어요",
                     debug={"reason": None, "raw": {"level": None}})
LABEL_DOWN = RuleSignal(id="yt_ai_label", status="unavailable", via="api",
                        debug={"reason": "innertube blocked (http 429); html blocked/cooldown",
                               "raw": None})


@contextlib.contextmanager
def client(tmp_path: Path, monkeypatch, rules=(), fetch="blocked", **kw):
    async def fake_rules(n, http):
        return [RuleSignal(**{**r.to_dict(), "debug": r.debug}) for r in rules]

    monkeypatch.setattr(pipeline_mod, "extract_signals", fake_rules)
    s = base_settings(tmp_path, **kw)
    with TestClient(create_app(s, Pipeline(s, fetcher=FakeFetcher(fetch)))) as c:
        yield c


def _upload(c, video: Path):
    return c.post("/v1/detect", files={"file": ("v.mp4", video.read_bytes(), "video/mp4")},
                  data={"source": "upload"})


class FakeResp:
    def __init__(self, status: int, payload=None, text: str = ""):
        self.status_code, self._p = status, payload
        self.text = text or json.dumps(payload or {})

    def json(self):
        if self._p is None:
            raise ValueError("no json")
        return self._p


def _hive_replies(monkeypatch, resp):
    monkeypatch.setenv("HIVE_API_KEY", FAKE_KEY)
    monkeypatch.setattr(httpx, "post", lambda *a, **k: resp)


# ------------------------------------------------------------------ settings
def test_setting_default_off(monkeypatch):
    monkeypatch.delenv("JJAJJA_DEBUG", raising=False)
    assert Settings.from_env().debug is False
    monkeypatch.setenv("JJAJJA_DEBUG", "1")
    assert Settings.from_env().debug is True


# ------------------------------------------------------------------ off
def test_debug_off_has_no_field_but_keeps_nulls(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch, rules=[NO_SELF, LABEL_DOWN]) as c:
        r = c.post("/v1/detect", json={"url": URL})
    assert r.status_code == 200, r.text
    b = r.json()
    assert_contract_body(b)  # exact contract keys -> no `debug`
    assert "debug" not in r.text
    for s in b["signals"]:
        assert "present" in s and "score" in s  # null fields are still serialized
    assert next(s for s in b["signals"] if s["id"] == "yt_ai_label")["present"] is None


# ------------------------------------------------------------------ on
def test_debug_on_every_signal(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch, rules=[NO_SELF, LABEL_DOWN], debug=True) as c:
        b = c.post("/v1/detect", json={"url": URL}).json()
    for s in b["signals"]:
        assert set(s) == CONTRACT_SIGNAL_KEYS | {"debug"}
        assert set(s["debug"]) == {"reason", "raw"}
        assert s["present"] is None or isinstance(s["present"], bool)
    sig = {s["id"]: s for s in b["signals"]}
    assert sig["yt_self_report_ai"]["debug"] == {"reason": None, "raw": {"level": None}}
    assert "innertube blocked" in sig["yt_ai_label"]["debug"]["reason"]
    # video blocked by YouTube -> the model says why it has no score
    assert sig["mock"]["debug"]["reason"].startswith("video not fetched (blocked:")


def test_debug_on_ok_model_raw_and_cached(tmp_path, monkeypatch, sample_video):
    with client(tmp_path, monkeypatch, debug=True) as c:
        a = _upload(c, sample_video).json()
        b = _upload(c, sample_video).json()
    m = next(s for s in a["signals"] if s["id"] == "mock")
    assert m["status"] == "ok" and m["debug"]["reason"] is None
    assert m["debug"]["raw"] == {"score": 0.2}
    assert b["cached"] is True
    assert all(s["debug"] == {"reason": dbg.CACHED, "raw": None} for s in b["signals"])


def test_cache_never_stores_debug(tmp_path, monkeypatch, sample_video):
    with client(tmp_path, monkeypatch, debug=True) as c:
        _upload(c, sample_video)
    files = list((tmp_path / "cache" / "results").glob("*.json"))
    assert files and all("debug" not in f.read_text() for f in files)


def test_weight_zero_reason():
    import asyncio
    from detectors import Registry
    from detectors.base import MediaBundle
    reg = Registry(["mock"], {"mock": {"weight": 0.0, "fixed_score": 0.3}}, debug=True)
    reg.load_all()
    sig = asyncio.run(reg.run_all(MediaBundle(None, frames=[]), 5))[0]
    assert sig["status"] == "ok" and sig["debug"]["reason"] == "weight 0 (disabled)"


# ------------------------------------------------------------------ Hive 405 (demo incident)
def test_hive_405_reason_visible(tmp_path, monkeypatch, sample_video):
    _hive_replies(monkeypatch, FakeResp(405, {"status_code": 405, "message": PAUSED}))
    with client(tmp_path, monkeypatch, detectors=["hive"], debug=True) as c:
        r = _upload(c, sample_video)
    assert r.status_code == 200, r.text
    hive = next(s for s in r.json()["signals"] if s["id"] == "hive")
    assert hive["status"] == "error" and hive["score"] is None
    reason = hive["debug"]["reason"]
    assert reason.startswith("http 405: Your Organization is currently paused")
    assert reason == f"http 405: {PAUSED[:120]}"
    assert FAKE_KEY not in r.text


def test_hive_405_hidden_when_debug_off(tmp_path, monkeypatch, sample_video):
    _hive_replies(monkeypatch, FakeResp(405, {"status_code": 405, "message": PAUSED}))
    with client(tmp_path, monkeypatch, detectors=["hive"]) as c:
        r = _upload(c, sample_video)
    assert "debug" not in r.text and "paused" not in r.text


def test_hive_not_loaded_reason(tmp_path, monkeypatch, sample_video):
    monkeypatch.delenv("HIVE_API_KEY", raising=False)
    with client(tmp_path, monkeypatch, detectors=["hive"], debug=True) as c:
        b = _upload(c, sample_video).json()
    hive = next(s for s in b["signals"] if s["id"] == "hive")
    assert hive["debug"]["reason"] == "not loaded (RuntimeError: HIVE_API_KEY not set)"


def test_hive_ok_raw_summary(tmp_path, monkeypatch, sample_video):
    fx = json.loads((Path(__file__).parent / "fixtures" / "hive_sample.json").read_text())
    _hive_replies(monkeypatch, FakeResp(200, fx))
    with client(tmp_path, monkeypatch, detectors=["hive"], debug=True) as c:
        b = _upload(c, sample_video).json()
    raw = next(s for s in b["signals"] if s["id"] == "hive")["debug"]["raw"]
    assert {"mean", "top25", "frames", "top_generator", "audio", "deepfake"} <= set(raw)
    assert raw["frames"] == 7 and "per_frame" not in raw


# ------------------------------------------------------------------ masking
def test_hive_error_echoing_secrets_is_masked(tmp_path, monkeypatch, sample_video):
    body = (f"denied: authorization: Bearer {FAKE_KEY} cookie: SID=abc123def; "
            f"api_key={FAKE_KEY}")
    _hive_replies(monkeypatch, FakeResp(403, None, body))
    with client(tmp_path, monkeypatch, detectors=["hive"], debug=True) as c:
        r = _upload(c, sample_video)
    reason = next(s for s in r.json()["signals"] if s["id"] == "hive")["debug"]["reason"]
    assert reason.startswith("http 403: denied")
    assert FAKE_KEY not in r.text and "abc123def" not in r.text


@pytest.mark.parametrize("text", [
    "Authorization: Bearer abcdefgh12345678",
    "bearer abcdefgh12345678",
    "Cookie: SID=abcdefgh12345678; HSID=zzz",
    "set-cookie: VISITOR=abcdefgh12345678",
    "https://x/?api_key=abcdefgh12345678&a=1",
    '{"access_token": "abcdefgh12345678"}',
])
def test_redact_patterns(text):
    out = dbg.redact(text, secrets=[])
    assert "abcdefgh12345678" not in out and "***" in out


def test_sanitize_masks_env_secret_values_and_shrinks_raw(monkeypatch):
    monkeypatch.setenv("SOME_VENDOR_API_KEY", "zz-secret-value-42")
    d = dbg.sanitize({"reason": "failed with zz-secret-value-42",
                      "raw": {"mean": 0.123456789, "note": "zz-secret-value-42",
                              "per_frame": list(range(100)), "nested": {"a": 1},
                              **{f"k{i}": i for i in range(30)}}})
    assert "zz-secret-value-42" not in json.dumps(d)
    assert d["raw"]["mean"] == 0.1235 and len(d["raw"]["per_frame"]) == dbg.LIST_MAX
    assert "nested" not in d["raw"] and len(d["raw"]) <= dbg.RAW_MAX_KEYS
