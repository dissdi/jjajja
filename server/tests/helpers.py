"""Shared test helpers (no network, no YouTube)."""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from app.settings import Settings
from media.fetch import FetchResult

from media.ffmpeg import find_ffmpeg

FFMPEG = find_ffmpeg()

CONTRACT_RESPONSE_KEYS = {"request_id", "platform", "video_id", "ai_probability", "verdict",
                          "partial", "signals", "cached", "analyzed_at"}
CONTRACT_SIGNAL_KEYS = {"id", "kind", "status", "decisive", "score", "weight", "evidence_ko", "via"}


def make_video(path: Path, seconds: float = 4, size: str = "360x640", rate: int = 24,
               src: str = "testsrc2") -> Path:
    """Synthesize a small H.264 clip with ffmpeg (fixtures are not committed: *.mp4 is ignored)."""
    subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y",
                    "-f", "lavfi", "-i", f"{src}=size={size}:rate={rate}:duration={seconds}",
                    "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
                    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-shortest", str(path)], check=True)
    return path


def base_settings(tmp: Path, **kw) -> Settings:
    s = Settings()
    s.detectors = []
    s.enable_mock = True
    s.mock_score = 0.2
    s.fetch_enabled = False
    s.cache_dir = tmp / "cache"
    s.rate_limit_per_min = 0
    for k, v in kw.items():
        setattr(s, k, v)
    return s


class FakeFetcher:
    """Stands in for yt-dlp. mode: 'blocked' | 'unavailable' | Path (copy this file)."""

    def __init__(self, mode):
        self.mode = mode
        self.calls = 0

    def fetch(self, url: str, out_dir: Path) -> FetchResult:
        self.calls += 1
        if isinstance(self.mode, Path):
            out_dir.mkdir(parents=True, exist_ok=True)
            dst = out_dir / "video.mp4"
            shutil.copy(self.mode, dst)
            return FetchResult(dst)
        msg = {"blocked": "ERROR: Sign in to confirm you're not a bot",
               "unavailable": "ERROR: Private video. Sign in if you've been granted access"}[self.mode]
        return FetchResult(None, self.mode, msg)


def assert_contract_body(body: dict) -> None:
    from app.schemas import DetectResponse
    assert set(body) == CONTRACT_RESPONSE_KEYS, set(body) ^ CONTRACT_RESPONSE_KEYS
    DetectResponse.model_validate(body)
    for s in body["signals"]:
        assert set(s) == CONTRACT_SIGNAL_KEYS
        if s["status"] == "ok":
            assert s["evidence_ko"].strip(), s  # UX: evidence for every ok signal (neg. too)
            assert s["score"] is not None
    # partial <=> no ok model signal (contract v1.1)
    assert body["partial"] == (not any(s["kind"] == "model" and s["status"] == "ok"
                                       for s in body["signals"]))
    assert body["analyzed_at"].endswith("Z")


def assert_error(resp, status: int, code: str) -> None:
    assert resp.status_code == status, resp.text
    j = resp.json()
    assert set(j) == {"error"} and set(j["error"]) == {"code", "message_ko"}
    assert j["error"]["code"] == code and j["error"]["message_ko"]
