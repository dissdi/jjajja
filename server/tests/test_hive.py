"""Hive adapter tests. The real API is NEVER called: httpx.post is monkeypatched everywhere.

Fixture tests/fixtures/hive_sample.json is a real 3-second reply (no key, no headers inside).
"""
from __future__ import annotations

import copy
import json
import logging
from pathlib import Path

import httpx
import pytest

from detectors import Registry
from detectors.base import EVIDENCE_DOWN, EVIDENCE_ERROR, EVIDENCE_TIMEOUT, MediaBundle
from detectors.hive import EVIDENCE_HIGH, EVIDENCE_LOW, HiveDetector, HiveError, aggregate

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "hive_sample.json").read_text())
FAKE_KEY = "test-key-not-real-0123456789"
CFG = {"weight": 0.25, "max_seconds": 20, "timeout_s": 5, "retries": 0}


def _with_ai(values: list[float]) -> dict:
    """Fixture reply rewritten so frame i has ai_generated = values[i]."""
    r = copy.deepcopy(FIXTURE)
    base = r["output"][0]
    r["output"] = []
    for i, v in enumerate(values):
        f = copy.deepcopy(base)
        f["extra"] = [{"name": "frame_index", "value": i}, {"name": "timestamp", "value": float(i)}]
        for c in f["classes"]:
            if c["class"] == "ai_generated":
                c["value"] = v
            elif c["class"] == "not_ai_generated":
                c["value"] = 1 - v
            elif c["class"] not in ("none",) and c["class"] not in (
                    "deepfake", "ai_generated_audio", "not_ai_generated_audio",
                    "inconclusive", "inconclusive_video"):
                c["value"] = 0.0  # zero all generator classes
        r["output"].append(f)
    return r


class FakeResp:
    def __init__(self, status: int, payload=None, text: str = ""):
        self.status_code, self._p, self.text = status, payload, text or json.dumps(payload or {})

    def json(self):
        if self._p is None:
            raise ValueError("no json")
        return self._p


@pytest.fixture
def hive(monkeypatch):
    monkeypatch.setenv("HIVE_API_KEY", FAKE_KEY)
    d = HiveDetector(dict(CFG))
    d.load()
    return d


@pytest.fixture
def media(sample_video):
    return MediaBundle(video_path=sample_video, frames=[], meta={})


def _patch_post(monkeypatch, fn):
    calls = []

    def fake(url, json=None, timeout=None, headers=None):  # noqa: A002
        calls.append({"url": url, "json": json, "timeout": timeout, "headers": headers})
        return fn()

    monkeypatch.setattr(httpx, "post", fake)
    return calls


# ------------------------------------------------------------------ parsing
def test_aggregate_fixture():
    raw = aggregate(FIXTURE)
    assert raw["n_frames"] == 7 and raw["n_scored"] == 7
    assert raw["ai_mean"] > 0.99 and raw["ai_top25"] > 0.99
    assert raw["top_generator"] == "ltx"          # raw only (QA), never user-facing
    assert raw["deepfake_max"] == 0.0
    assert raw["audio_ai_max"] is not None and raw["audio_ai_max"] < 0.01
    assert raw["timestamps"][0] == 0.0


def test_aggregate_mean_vs_top25_and_generator_threshold():
    raw = aggregate(_with_ai([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0]))
    assert raw["ai_mean"] == pytest.approx(0.25)
    assert raw["ai_top25"] == pytest.approx(1.0)   # top 2 of 8 frames
    assert raw["top_generator"] is None            # every generator class < 0.5


@pytest.mark.parametrize("bad", [{}, {"output": []}, {"output": [{"classes": []}]}])
def test_aggregate_rejects_empty(bad):
    with pytest.raises(HiveError):
        aggregate(bad)


# ------------------------------------------------------------------ key handling
def test_no_key_is_down_and_server_signal_unavailable(monkeypatch, media):
    monkeypatch.delenv("HIVE_API_KEY", raising=False)
    reg = Registry(["hive"], {"hive": CFG})
    reg.load_all()
    assert reg.health() == {"hive": "down"}
    assert "HIVE_API_KEY" in reg.handles[0].error
    import asyncio
    sig = asyncio.run(reg.run_all(media, 5))[0]
    assert sig["id"] == "hive" and sig["status"] == "unavailable" and sig["score"] is None
    assert sig["evidence_ko"] == EVIDENCE_DOWN and sig["present"] is None


# ------------------------------------------------------------------ infer (mocked HTTP)
def test_infer_ok_sends_clip(monkeypatch, hive, media):
    calls = _patch_post(monkeypatch, lambda: FakeResp(200, FIXTURE))
    r = hive.infer(media)
    assert r.status == "ok" and r.score > 0.99
    assert r.evidence_ko == EVIDENCE_HIGH
    assert len(calls) == 1
    c = calls[0]
    assert c["headers"]["authorization"] == f"Bearer {FAKE_KEY}"
    assert c["json"]["processing_mode"] == "sync_with_fallback"
    assert c["json"]["input"][0]["media_base64"]
    assert c["timeout"] == 5
    assert r.raw["clip"] in ("copy", "reencode_360p") and r.raw["n_frames"] == 7
    # evidence is plain Korean: no generator names / English jargon
    latin = "".join(ch for ch in r.evidence_ko.replace("AI", "") if ch.isascii() and ch.isalpha())
    assert latin == "", r.evidence_ko  # only the word "AI" is allowed
    assert FAKE_KEY not in json.dumps(r.raw)


def test_infer_low_score_evidence(monkeypatch, hive, media):
    _patch_post(monkeypatch, lambda: FakeResp(200, _with_ai([0.01, 0.02, 0.0])))
    r = hive.infer(media)
    assert r.status == "ok" and r.score < 0.05 and r.evidence_ko == EVIDENCE_LOW


def test_infer_top25_aggregate(monkeypatch, media):
    monkeypatch.setenv("HIVE_API_KEY", FAKE_KEY)
    d = HiveDetector({**CFG, "aggregate": "top25"})
    d.load()
    _patch_post(monkeypatch, lambda: FakeResp(200, _with_ai([0.0, 0.0, 0.0, 0.9])))
    assert d.infer(media).score == pytest.approx(0.9)


def test_clip_is_cut_to_max_seconds(hive, long_video, tmp_path):
    from media.ffmpeg import probe
    clip, how = hive.prepare_clip(long_video, tmp_path)
    info = probe(clip, hive.ffmpeg, hive.ffprobe)
    assert info.duration <= 21.0 and how in ("copy", "reencode_360p")


@pytest.mark.parametrize("status", [429, 500, 502, 503])
def test_rate_limit_and_5xx_unavailable_without_retry(monkeypatch, hive, media, status):
    calls = _patch_post(monkeypatch, lambda: FakeResp(status, None, "busy"))
    r = hive.infer(media)
    assert r.status == "unavailable" and r.score is None and r.evidence_ko == EVIDENCE_DOWN
    assert len(calls) == 1  # no retry


def test_timeout_unavailable(monkeypatch, hive, media):
    def boom():
        raise httpx.ReadTimeout("slow")
    calls = _patch_post(monkeypatch, boom)
    r = hive.infer(media)
    assert r.status == "unavailable" and r.evidence_ko == EVIDENCE_TIMEOUT and len(calls) == 1


def test_4xx_error_masks_key_in_logs(monkeypatch, hive, media, caplog):
    # a (hypothetical) error body echoing the key must not reach logs or raw
    _patch_post(monkeypatch, lambda: FakeResp(401, None, f"bad token Bearer {FAKE_KEY}"))
    with caplog.at_level(logging.DEBUG):
        r = hive.infer(media)
    assert r.status == "error" and r.evidence_ko == EVIDENCE_ERROR
    assert FAKE_KEY not in caplog.text and FAKE_KEY not in json.dumps(r.raw)
    assert "***" in r.raw["error"]


def test_bad_json_is_error(monkeypatch, hive, media):
    _patch_post(monkeypatch, lambda: FakeResp(200, None, "<html>"))
    assert hive.infer(media).status == "error"


def test_no_video_unavailable(hive):
    r = hive.infer(MediaBundle(video_path=None, frames=[]))
    assert r.status == "unavailable" and r.score is None


def test_registry_signal_contract_shape(monkeypatch, media):
    import asyncio
    from tests.helpers import CONTRACT_SIGNAL_KEYS
    monkeypatch.setenv("HIVE_API_KEY", FAKE_KEY)
    _patch_post(monkeypatch, lambda: FakeResp(429, None, "slow down"))
    reg = Registry(["hive"], {"hive": CFG})
    reg.load_all()
    sig = asyncio.run(reg.run_all(media, 5))[0]
    assert set(sig) == CONTRACT_SIGNAL_KEYS
    assert sig["status"] == "unavailable" and sig["weight"] == 0.25 and sig["kind"] == "model"


# ------------------------------------------------------------------ .env loading
def test_env_file_loader_does_not_override(tmp_path, monkeypatch):
    from app.settings import load_env_file
    f = tmp_path / ".env"
    f.write_text("# c\nJJ_TEST_A=1\nexport JJ_TEST_B='two'\nJJ_TEST_C=keep\n")
    monkeypatch.setenv("JJ_TEST_C", "orig")
    monkeypatch.delenv("JJ_TEST_A", raising=False)
    monkeypatch.delenv("JJ_TEST_B", raising=False)
    loaded = load_env_file(f)
    import os
    assert sorted(loaded) == ["JJ_TEST_A", "JJ_TEST_B"]
    assert os.environ["JJ_TEST_B"] == "two" and os.environ["JJ_TEST_C"] == "orig"
    monkeypatch.delenv("JJ_TEST_A")
    monkeypatch.delenv("JJ_TEST_B")


def test_env_file_disabled_in_tests():
    import os
    from app.settings import load_env_file
    assert os.environ.get("JJAJJA_ENV_FILE") == ""
    assert load_env_file() == []


# ------------------------------------------------------------------ weights.yaml v3 policy
def test_weights_v3_hive_strong_positive_only():
    import yaml
    from app.ensemble import EnsembleConfig, combine
    from app.settings import Settings
    w = yaml.safe_load(Path(Settings().weights_path).read_text())
    cfg = EnsembleConfig.from_weights(w)
    assert w["detectors"]["hive"]["calibrated"] is False
    assert "hive" in cfg.strong_signals and "hive" not in cfg.strong_negative_signals
    hw, cw = w["detectors"]["hive"]["weight"], w["detectors"]["commfor_224"]["weight"]

    def sig(i, s, wt):
        return {"id": i, "status": "ok", "score": s, "weight": wt, "decisive": False}
    # upload path, Hive sure it is AI -> cap released -> likely_ai
    p, v = combine([sig("hive", 0.99, hw), sig("commfor_224", 0.3, cw)], cfg)
    assert v == "likely_ai" and p > 0.74
    # Hive sure it is real -> floor kept (never "AI 흔적 없음" from models alone)
    p, v = combine([sig("hive", 0.01, hw), sig("commfor_224", 0.05, cw)], cfg)
    assert (p, v) == (0.4, "uncertain")
    # CommFor alone high -> still capped
    p, v = combine([sig("commfor_224", 0.99, cw)], cfg)
    assert v == "uncertain" and p == 0.74
