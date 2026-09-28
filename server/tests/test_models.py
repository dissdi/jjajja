"""Real OSS detectors (downloads HF weights on first run). Opt-in: JJAJJA_TEST_MODELS=1.
Runs on CPU unless JJAJJA_DEVICE=cuda and CUDA_VISIBLE_DEVICES are set (shared-GPU rule)."""
from __future__ import annotations

import os
import time

import pytest
import yaml
from fastapi.testclient import TestClient

from app.main import create_app
from app.pipeline import Pipeline
from app.settings import SERVER_DIR, Settings
from detectors import Registry
from detectors.base import MediaBundle
from media.ffmpeg import find_ffmpeg, find_ffprobe, probe, sample_clip, sample_uniform
from tests.helpers import assert_contract_body, base_settings

pytestmark = [pytest.mark.models,
              pytest.mark.skipif(os.environ.get("JJAJJA_TEST_MODELS") != "1",
                                 reason="set JJAJJA_TEST_MODELS=1 to run real models")]


@pytest.fixture(scope="module")
def registry():
    w = yaml.safe_load((SERVER_DIR / "config/weights.yaml").read_text())
    reg = Registry(["d3", "commfor_224"], w["detectors"], Settings.from_env().resolved_device())
    reg.load_all()
    assert reg.health() == {"d3": "ok", "commfor_224": "ok"}, [h.error for h in reg.handles]
    return reg


def test_detectors_score_sample(registry, sample_video, tmp_path):
    ff = find_ffmpeg()
    info = probe(sample_video, ff, find_ffprobe())
    media = MediaBundle(sample_video, sample_uniform(sample_video, tmp_path / "u", 16, info.duration, ff),
                        sample_clip(sample_video, tmp_path / "c", 16, 8, info.duration, ff))
    for h in registry.handles:
        t0 = time.perf_counter()
        r = h.detector.infer(media)
        dt = time.perf_counter() - t0
        print(f"{h.id}: score={r.score:.3f} raw={r.raw if h.id == 'd3' else r.raw['mean']} {dt:.2f}s")
        assert r.status == "ok" and 0.0 <= r.score <= 1.0 and r.evidence_ko
        assert dt < 60


def test_upload_end_to_end_real_models(tmp_path, sample_video):
    s = base_settings(tmp_path, detectors=["d3", "commfor_224"], enable_mock=False)
    with TestClient(create_app(s, Pipeline(s))) as c:
        assert c.get("/v1/health").json()["detectors"] == {"d3": "ok", "commfor_224": "ok"}
        with open(sample_video, "rb") as f:
            r = c.post("/v1/detect", files={"file": ("a.mp4", f, "video/mp4")}, data={"source": "upload"})
    assert r.status_code == 200, r.text
    b = r.json()
    assert_contract_body(b)
    assert b["partial"] is False and {s["id"] for s in b["signals"]} == {"d3", "commfor_224"}
    assert b["ai_probability"] <= 0.74  # uncalibrated models alone are capped
