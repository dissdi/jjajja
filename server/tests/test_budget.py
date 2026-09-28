"""Response-time budget (contract v1.2 "응답 시간", issue #1). No network, no real long waits:
slow stages are stubs blocked on threading.Events, budgets are fractions of a second."""
from __future__ import annotations

import asyncio
import contextlib
import re
import threading
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.pipeline as pipeline_mod
import detectors
from app.main import create_app
from app.pipeline import Pipeline
from app.settings import Settings
from detectors.base import EVIDENCE_TIMEOUT, Detector, DetectorResult
from media.fetch import FetchResult
from media.workdir import WorkDir, WorkDirClosed
from rules import RuleSignal
from tests.helpers import FakeFetcher, assert_contract_body, assert_error, base_settings

ROOT = Path(__file__).resolve().parents[2]
URL = "https://youtube.com/shorts/jzE0Rcb2hY4"
CREATOR = RuleSignal(id="yt_creator_ai_disclosure", score=0.95, weight=3.0,
                     evidence_ko="올린 사람이 유튜브에 'AI로 만든 영상'이라고 밝혔어요")


def _wait_until(cond, timeout=5.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if cond():
            return True
        time.sleep(0.01)
    return cond()


class SlowFetcher:
    """Blocks like a hung yt-dlp until released, then writes into out_dir like the real one."""

    def __init__(self, video: Path | None = None):
        self.release = threading.Event()
        self.done = threading.Event()
        self.video = video
        self.calls = 0

    def fetch(self, url: str, out_dir: Path) -> FetchResult:
        self.calls += 1
        try:
            self.release.wait(10)
            out_dir.mkdir(parents=True, exist_ok=True)  # the leak we must not allow
            dst = out_dir / "video.mp4"
            dst.write_bytes(self.video.read_bytes() if self.video else b"late")
            return FetchResult(dst)
        finally:
            self.done.set()


class SlowDetector(Detector):
    id = "slow"
    version = "1"
    release = threading.Event()

    def infer(self, media):
        type(self).release.wait(10)
        return DetectorResult(0.9, "ok", "늦게 나온 결과예요")


@contextlib.contextmanager
def client(tmp_path: Path, monkeypatch, *, fetcher, rules=(), rules_delay=0.0, **kw):
    async def fake_rules(n, http):
        if rules_delay:
            await asyncio.sleep(rules_delay)
        return list(rules)

    monkeypatch.setattr(pipeline_mod, "extract_signals", fake_rules)
    s = base_settings(tmp_path, **kw)
    pipe = Pipeline(s, fetcher=fetcher)
    with TestClient(create_app(s, pipe)) as c:
        c.pipe = pipe
        yield c


def _timed_post(c, **kw):
    t0 = time.monotonic()
    r = c.post("/v1/detect", **kw)
    return r, time.monotonic() - t0


def _tmp_entries(c) -> list[Path]:
    return list(c.pipe.tmp_root.iterdir())


# ---------------------------------------------------------------- URL path
def test_url_slow_download_answers_within_budget(tmp_path, monkeypatch):
    f = SlowFetcher()
    with client(tmp_path, monkeypatch, fetcher=f, rules=[CREATOR], url_budget_s=0.3) as c:
        r, dt = _timed_post(c, json={"url": URL})
        assert r.status_code == 200, r.text
        assert dt < 2.0, dt
        b = r.json()
        assert_contract_body(b)
        assert b["partial"] is True and b["ai_probability"] == 0.95  # rules still count
        mock = next(s for s in b["signals"] if s["id"] == "mock")
        assert mock["status"] == "unavailable" and mock["score"] is None
        assert mock["evidence_ko"] == EVIDENCE_TIMEOUT
        assert not c.pipe.cache._mem  # budget-cut answers are not cached

        # the abandoned yt-dlp thread finishes later: it must not leave its folder behind
        f.release.set()
        assert f.done.wait(5)
        assert _wait_until(lambda: not _tmp_entries(c)), _tmp_entries(c)
        assert not c.pipe.cache._mem


def test_url_slow_rules_answers_within_budget(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch, fetcher=FakeFetcher("blocked"), rules=[CREATOR],
                rules_delay=30, url_budget_s=0.3) as c:
        r, dt = _timed_post(c, json={"url": URL})
        assert r.status_code == 200 and dt < 2.0, (r.text, dt)
        b = r.json()
        assert_contract_body(b)
        assert not any(s["kind"] == "rule" for s in b["signals"])
        assert b["ai_probability"] is None and b["verdict"] == "unknown" and b["partial"] is True
        assert not _tmp_entries(c)


def test_url_slow_detector_keeps_finished_ones(tmp_path, monkeypatch, sample_video):
    monkeypatch.setitem(detectors.FACTORIES, "slow", lambda cfg, dev: SlowDetector(cfg, dev))
    SlowDetector.release = threading.Event()
    with client(tmp_path, monkeypatch, fetcher=FakeFetcher(sample_video), rules=[CREATOR],
                detectors=["slow"], url_budget_s=2.0) as c:
        try:
            r, dt = _timed_post(c, json={"url": URL})
        finally:
            SlowDetector.release.set()
        assert r.status_code == 200, r.text
        assert dt < 2.8, dt
        b = r.json()
        assert_contract_body(b)
        by = {s["id"]: s for s in b["signals"]}
        assert by["mock"]["status"] == "ok"
        assert by["slow"]["status"] == "unavailable" and by["slow"]["evidence_ko"] == EVIDENCE_TIMEOUT
        assert b["partial"] is False  # one model did see the video
        assert not c.pipe.cache._mem
        assert _wait_until(lambda: not _tmp_entries(c)), _tmp_entries(c)


# ---------------------------------------------------------------- upload path
def _upload(c, path: Path):
    with open(path, "rb") as fh:
        return _timed_post(c, files={"file": ("clip.mp4", fh, "video/mp4")},
                           data={"source": "upload"})


def test_upload_slow_detector_within_budget(tmp_path, monkeypatch, sample_video):
    monkeypatch.setitem(detectors.FACTORIES, "slow", lambda cfg, dev: SlowDetector(cfg, dev))
    SlowDetector.release = threading.Event()
    with client(tmp_path, monkeypatch, fetcher=FakeFetcher("blocked"), detectors=["slow"],
                upload_budget_s=2.0) as c:
        try:
            r, dt = _upload(c, sample_video)
        finally:
            SlowDetector.release.set()
        assert r.status_code == 200, r.text
        assert dt < 2.8, dt
        b = r.json()
        assert_contract_body(b)
        slow = next(s for s in b["signals"] if s["id"] == "slow")
        assert slow["status"] == "unavailable" and slow["evidence_ko"] == EVIDENCE_TIMEOUT
        assert _wait_until(lambda: not _tmp_entries(c)), _tmp_entries(c)


def test_upload_budget_gone_all_models_is_503(tmp_path, monkeypatch, sample_video):
    monkeypatch.setitem(detectors.FACTORIES, "slow", lambda cfg, dev: SlowDetector(cfg, dev))
    SlowDetector.release = threading.Event()
    with client(tmp_path, monkeypatch, fetcher=FakeFetcher("blocked"), detectors=["slow"],
                enable_mock=False, upload_budget_s=1.5) as c:
        try:
            r, dt = _upload(c, sample_video)
        finally:
            SlowDetector.release.set()
        assert_error(r, 503, "detectors_down")
        assert dt < 2.5, dt


# ---------------------------------------------------------------- WorkDir cleanup guarantee
def test_workdir_last_worker_removes_folder(tmp_path):
    async def go():
        w = WorkDir(tmp_path, "t_")
        gate, started = threading.Event(), threading.Event()

        def job():
            started.set()
            gate.wait(5)
            (w.path / "late").mkdir(parents=True)  # a worker writing after the request gave up
            return 1

        task = asyncio.ensure_future(w.run(job))
        assert await asyncio.to_thread(started.wait, 5)
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(asyncio.shield(task), 0.05)
        w.close()
        assert w.path.exists() and not w.removed  # still in use
        gate.set()
        assert await task == 1
        assert w.removed and not w.path.exists()
        with pytest.raises(WorkDirClosed):
            await w.run(lambda: None)
        assert not w.path.exists()

    asyncio.run(go())


def test_workdir_close_idle_removes_now(tmp_path):
    w = WorkDir(tmp_path, "t_")
    (w.path / "x").write_text("x")
    w.close()
    assert not w.path.exists()


# ---------------------------------------------------------------- settings + app boundary
def test_budget_env(monkeypatch):
    monkeypatch.setenv("JJAJJA_URL_BUDGET_S", "12.5")
    monkeypatch.setenv("JJAJJA_UPLOAD_BUDGET_S", "90")
    s = Settings.from_env()
    assert (s.url_budget_s, s.upload_budget_s) == (12.5, 90.0)


def _ts_ms(text: str, name: str) -> int:
    m = re.search(rf"export\s+const\s+{name}\s*(?::\s*number\s*)?=\s*([\d_]+)\s*;", text)
    assert m, f"{name} not found in client.ts"
    return int(m.group(1).replace("_", ""))


CLIENT_TS = ROOT / "app" / "src" / "api" / "client.ts"


@pytest.mark.skipif(not CLIENT_TS.exists(), reason="app/src/api/client.ts not present")
def test_server_budget_shorter_than_app_timeout():
    """Server default budgets must end before the app gives up, or users get a timeout error
    instead of the partial answer the server was about to send (contract v1.2, #1)."""
    ts = CLIENT_TS.read_text(encoding="utf-8")
    url_ms, up_ms = _ts_ms(ts, "URL_TIMEOUT_MS"), _ts_ms(ts, "UPLOAD_TIMEOUT_MS")
    d = Settings()
    assert d.url_budget_s * 1000 < url_ms, (d.url_budget_s, url_ms)
    assert d.upload_budget_s * 1000 < up_ms, (d.upload_budget_s, up_ms)
