"""Hive "AI-Generated and Deepfake Content Detection" (commercial API, v3) adapter.  id = `hive`

  POST https://api.thehive.ai/api/v3/hive/ai-generated-and-deepfake-content-detection
  headers: authorization: Bearer $HIVE_API_KEY
  body:    {"input": [{"media_base64": "<mp4>"}], "processing_mode": "sync_with_fallback"}
  reply:   {"task_id", "model", "version", "output": [ {extra: [frame_index, timestamp],
            classes: [{class, value}, ...]} , ... ]}      # one output item per second of video

Classes used: `ai_generated` (video score), `deepfake`, `ai_generated_audio` (kept in raw only),
`inconclusive`/`inconclusive_video` (raw only) and ~110 generator-source classes (`veo3`, `sora2`,
`kling`, ..., `none`) -> the top one (excluding `none`, value >= 0.5) is kept in raw for QA.
Generator names never reach `evidence_ko` (senior-ux-korean: no model/brand names, no jargon).

Cost control: Hive bills per analysed frame (1 fps; $6 / 1000 frames at the time of writing).
Only the first `max_seconds` (default 20) of the video are sent — cut by ffmpeg with stream copy
when the source is already small H.264/MP4, otherwise re-encoded to 360p H.264 (no retries on
429/5xx; results are cached per video by the pipeline).

Secrets: the API key is read ONLY from the environment (HIVE_API_KEY; server/.env is loaded by
app.settings when present). It is never logged: request headers are not logged and any text we
log is passed through `_mask()`. Without a key `load()` raises -> the registry reports the
detector "down" and every response carries a `hive` signal with status "unavailable".

TERMS / PRIVACY: the video (first 20 s) is sent to a third party (Hive). Covered by the same
pre-launch legal review as the yt-dlp download (README).
"""
from __future__ import annotations

import base64
import json
import logging
import math
import os
import subprocess
import tempfile
import threading
from pathlib import Path
from typing import Optional

import numpy as np

from .base import (EVIDENCE_DOWN, EVIDENCE_ERROR, EVIDENCE_TIMEOUT, Detector, DetectorResult,
                   MediaBundle, band)

log = logging.getLogger(__name__)

API_URL = "https://api.thehive.ai/api/v3/hive/ai-generated-and-deepfake-content-detection"
KEY_ENV = "HIVE_API_KEY"

# classes that are NOT generator-source classes
_NON_SOURCE = {"ai_generated", "not_ai_generated", "deepfake", "ai_generated_audio",
               "not_ai_generated_audio", "inconclusive", "inconclusive_video", "none"}

EVIDENCE_HIGH = "화면에서 AI로 만든 흔적이 많이 보여요"
EVIDENCE_MID = "화면만으로는 AI인지 판단하기 어려워요"
EVIDENCE_LOW = "화면에서 AI로 만든 흔적은 찾지 못했어요"


class HiveUnavailable(Exception):
    """Transient/remote problem (429, 5xx, network, timeout) -> status unavailable."""


class HiveError(Exception):
    """Our request or the reply is wrong (4xx other than 429, bad JSON) -> status error."""


def _mask(text: str, key: Optional[str]) -> str:
    text = str(text)
    if key:
        text = text.replace(key, "***")
    return text


def _http_message(r) -> str:
    """Hive error bodies are JSON with `message` (sometimes nested); fall back to the text.
    First 120 chars, single line -> the dev-mode reason reads `http 405: <message>`."""
    msg = ""
    try:
        j = r.json()
        if isinstance(j, dict):
            m = j.get("message") or j.get("error") or j.get("detail")
            if isinstance(m, dict):
                m = m.get("message") or json.dumps(m)
            msg = str(m or "")
    except Exception:
        pass
    msg = msg or str(getattr(r, "text", "") or "")
    return " ".join(msg.split())[:120]


def aggregate(resp: dict) -> dict:
    """Parse a Hive v3 reply into per-video raw numbers (pure function; unit-tested)."""
    frames = resp.get("output") or []
    if not isinstance(frames, list) or not frames:
        raise HiveError("reply has no output frames")
    per: list[dict[str, float]] = []
    ts: list[float] = []
    for f in frames:
        cls = {c.get("class"): float(c.get("value", 0.0)) for c in (f.get("classes") or [])
               if isinstance(c, dict) and c.get("class") is not None}
        if "ai_generated" not in cls:
            continue
        per.append(cls)
        ex = {e.get("name"): e.get("value") for e in (f.get("extra") or []) if isinstance(e, dict)}
        ts.append(float(ex.get("timestamp", len(ts)) or 0.0))
    if not per:
        raise HiveError("no frame carries an ai_generated score")

    ai = np.array([c["ai_generated"] for c in per])
    k = max(1, int(math.ceil(len(ai) * 0.25)))

    def col(name: str) -> Optional[np.ndarray]:
        v = [c[name] for c in per if name in c]
        return np.array(v) if v else None

    def stat(name: str, fn) -> Optional[float]:
        v = col(name)
        return None if v is None else round(float(fn(v)), 6)

    # generator source: mean over frames, `none` and non-source classes excluded
    src_names = {n for c in per for n in c} - _NON_SOURCE
    src_mean = {n: float(np.mean([c.get(n, 0.0) for c in per])) for n in src_names}
    top_src, top_val = (max(src_mean.items(), key=lambda kv: kv[1]) if src_mean else (None, 0.0))
    return {
        "n_frames": len(frames),
        "n_scored": len(per),
        "ai_mean": round(float(ai.mean()), 6),
        "ai_top25": round(float(np.sort(ai)[-k:].mean()), 6),
        "ai_max": round(float(ai.max()), 6),
        "per_frame": [round(float(x), 4) for x in ai],
        "timestamps": ts,
        "deepfake_mean": stat("deepfake", np.mean),
        "deepfake_max": stat("deepfake", np.max),
        "audio_ai_mean": stat("ai_generated_audio", np.mean),
        "audio_ai_max": stat("ai_generated_audio", np.max),
        "inconclusive_max": stat("inconclusive", np.max),
        "inconclusive_video_max": stat("inconclusive_video", np.max),
        "top_generator": top_src if top_val >= 0.5 else None,
        "top_generator_score": round(top_val, 6) if top_src else None,
    }


class HiveDetector(Detector):
    id = "hive"
    version = "hive-aigc-v3"

    # process-wide usage counter (skill ai-video-detection §5: count commercial API usage)
    _usage_lock = threading.Lock()
    usage = {"calls": 0, "frames": 0}

    def load(self) -> None:
        key = os.environ.get(KEY_ENV, "").strip()
        if not key:
            raise RuntimeError(f"{KEY_ENV} not set")  # -> registry: down / signal unavailable
        self._key = key
        self.url = str(self.cfg.get("url", API_URL))
        self.max_seconds = float(self.cfg.get("max_seconds", 20))
        self.timeout_s = float(self.cfg.get("timeout_s", 25))
        self.max_bytes = int(float(self.cfg.get("max_upload_mb", 8)) * 1024 * 1024)
        self.price_per_1000 = float(self.cfg.get("usd_per_1000_frames", 6.0))
        from media.ffmpeg import find_ffmpeg, find_ffprobe
        self.ffmpeg = find_ffmpeg(os.environ.get("JJAJJA_FFMPEG") or None)
        self.ffprobe = find_ffprobe(os.environ.get("JJAJJA_FFPROBE") or None)

    def debug_raw(self, raw: dict) -> dict:
        if "ai_mean" not in raw:
            return {k: raw[k] for k in ("clip",) if k in raw}
        return {"mean": raw.get("ai_mean"), "top25": raw.get("ai_top25"),
                "frames": raw.get("n_frames"), "top_generator": raw.get("top_generator"),
                "audio": raw.get("audio_ai_mean"), "deepfake": raw.get("deepfake_mean"),
                "aggregate": str(self.cfg.get("aggregate", "mean"))}

    # ------------------------------------------------------------------ media
    def _codec(self, path: Path) -> tuple[str, int, int]:
        if not self.ffprobe:
            return "", 0, 0
        r = subprocess.run([self.ffprobe, "-v", "error", "-select_streams", "v:0", "-show_entries",
                            "stream=codec_name,width,height", "-of", "json", str(path)],
                           capture_output=True, text=True, timeout=15)
        try:
            s = (json.loads(r.stdout or "{}").get("streams") or [{}])[0]
            return str(s.get("codec_name", "")), int(s.get("width", 0)), int(s.get("height", 0))
        except (ValueError, IndexError, TypeError):
            return "", 0, 0

    def prepare_clip(self, src: Path, out_dir: Path) -> tuple[Path, str]:
        """First `max_seconds` as MP4. Stream copy when cheap and safe, else 360p H.264."""
        codec, w, h = self._codec(src)
        out = out_dir / "hive_clip.mp4"
        t = f"{self.max_seconds:.3f}"
        if codec == "h264" and 0 < min(w, h) <= 720:
            r = subprocess.run([self.ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
                                "-t", t, "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy",
                                "-movflags", "+faststart", str(out)],
                               capture_output=True, text=True, timeout=30)
            if r.returncode == 0 and out.exists() and 0 < out.stat().st_size <= self.max_bytes:
                return out, "copy"
        scale = ("scale='if(gt(iw,ih),-2,trunc(min(360,iw)/2)*2)'"
                 ":'if(gt(iw,ih),trunc(min(360,ih)/2)*2,-2)'")
        r = subprocess.run([self.ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
                            "-t", t, "-map", "0:v:0", "-map", "0:a:0?", "-vf", scale,
                            "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k",
                            "-movflags", "+faststart", str(out)],
                           capture_output=True, text=True, timeout=60)
        if r.returncode != 0 or not out.exists():
            raise HiveError("ffmpeg clip failed: " + r.stderr.strip()[-200:])
        return out, "reencode_360p"

    # ------------------------------------------------------------------ http
    def post(self, clip: Path) -> dict:
        """One synchronous request. No retries here (429/5xx -> HiveUnavailable)."""
        import httpx
        body = {"input": [{"media_base64": base64.b64encode(clip.read_bytes()).decode("ascii")}],
                "processing_mode": "sync_with_fallback"}
        try:
            r = httpx.post(self.url, json=body, timeout=self.timeout_s,
                           headers={"authorization": f"Bearer {self._key}",
                                    "accept": "application/json"})
        except httpx.TimeoutException as e:
            raise HiveUnavailable(f"timeout after {self.timeout_s:g}s") from e
        except httpx.HTTPError as e:
            raise HiveUnavailable(_mask(f"network: {type(e).__name__}", self._key)) from e
        if r.status_code == 429 or r.status_code >= 500:
            raise HiveUnavailable(_mask(f"http {r.status_code}: {_http_message(r)}", self._key))
        if r.status_code != 200:
            # e.g. "http 405: Your Organization is currently paused..." (account/billing state)
            raise HiveError(_mask(f"http {r.status_code}: {_http_message(r)}", self._key))
        try:
            return r.json()
        except ValueError as e:
            raise HiveError("reply is not JSON") from e

    # ------------------------------------------------------------------ detector
    def infer(self, media: MediaBundle) -> DetectorResult:
        if media.video_path is None or not Path(media.video_path).exists():
            return DetectorResult(None, "unavailable", "영상을 받아오지 못해 화면은 확인하지 못했어요",
                                  {"error": "no video file"})
        with tempfile.TemporaryDirectory(prefix="hive_") as td:
            try:
                clip, how = self.prepare_clip(Path(media.video_path), Path(td))
                size = clip.stat().st_size
                resp = self.post(clip)
                raw = aggregate(resp)
            except HiveUnavailable as e:
                msg = _mask(str(e), getattr(self, "_key", None))
                log.warning("hive unavailable: %s", msg)
                ev = EVIDENCE_TIMEOUT if msg.startswith("timeout") else EVIDENCE_DOWN
                return DetectorResult(None, "unavailable", ev, {"error": msg})
            except (HiveError, subprocess.SubprocessError, OSError) as e:
                msg = _mask(str(e), getattr(self, "_key", None))
                log.warning("hive error: %s", msg)
                return DetectorResult(None, "error", EVIDENCE_ERROR, {"error": msg})
        with self._usage_lock:
            HiveDetector.usage["calls"] += 1
            HiveDetector.usage["frames"] += raw["n_frames"]
            tot = dict(HiveDetector.usage)
        raw.update(clip=how, clip_bytes=size, task_id=resp.get("task_id"),
                   model_version=resp.get("version"))
        log.info("hive usage: +%d frames (process total %d frames, %d calls, ~$%.2f)",
                 raw["n_frames"], tot["frames"], tot["calls"], tot["frames"] * self.price_per_1000 / 1000)
        agg = str(self.cfg.get("aggregate", "mean"))
        s = self.calibrate(raw["ai_top25"] if agg == "top25" else raw["ai_mean"])
        return DetectorResult(score=s, status="ok",
                              evidence_ko=band(s, EVIDENCE_HIGH, EVIDENCE_MID, EVIDENCE_LOW),
                              raw=raw)
