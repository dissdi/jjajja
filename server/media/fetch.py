"""Video acquisition from a platform URL via yt-dlp.

TERMS-OF-SERVICE RISK: YouTube/TikTok/Instagram terms restrict downloading content. This
code path exists for a research prototype only and must pass legal review before launch.
Preferred production path: the user uploads the video from their own device (POST
/v1/detect multipart), or official APIs.

This server's IP is currently bot-blocked by YouTube ("Sign in to confirm you're not a bot"),
so failure here is expected; the pipeline then answers from rule signals with partial=true.
A circuit breaker stops retrying for `cooldown_s` after a block, so we never hammer YouTube.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Optional

log = logging.getLogger(__name__)

FailReason = Literal["blocked", "unavailable", "error", "disabled", "cooldown"]

_UNAVAILABLE_MARKERS = (
    "private video", "video unavailable", "has been removed", "been terminated",
    "not available in your country", "geo restrict", "not made this video available",
    "this video is unavailable", "does not exist", "account associated with this video",
    "members-only", "join this channel", "http error 404",
)
_BLOCK_MARKERS = (
    "confirm you're not a bot", "confirm you’re not a bot", "sign in to confirm", "http error 429",
    "too many requests", "captcha", "/sorry/",
)


@dataclass
class FetchResult:
    path: Optional[Path]
    reason: Optional[FailReason] = None
    message: str = ""


def classify_error(msg: str) -> FailReason:
    m = msg.lower()
    if any(k in m for k in _BLOCK_MARKERS):
        return "blocked"
    if any(k in m for k in _UNAVAILABLE_MARKERS):
        return "unavailable"
    return "error"


class _QuietLogger:
    def debug(self, msg):
        pass

    info = warning = debug

    def error(self, msg):
        log.debug("yt-dlp: %s", msg)


class Fetcher:
    def __init__(self, enabled: bool = True, cooldown_s: float = 1800.0,
                 max_bytes: int = 200 * 1024 * 1024, ffmpeg: Optional[str] = None,
                 max_consecutive_errors: int = 2):
        self.enabled = enabled
        self.max_consecutive_errors = max_consecutive_errors
        self._consecutive_errors = 0
        self.cooldown_s = cooldown_s
        self.max_bytes = max_bytes
        self.ffmpeg = ffmpeg
        self._blocked_until = 0.0

    def fetch(self, url: str, out_dir: Path) -> FetchResult:
        """Blocking; call from a worker thread."""
        if not self.enabled:
            return FetchResult(None, "disabled", "fetch disabled by config")
        if time.time() < self._blocked_until:
            return FetchResult(None, "cooldown", "platform recently blocked us; skipping")
        try:
            import yt_dlp  # type: ignore
        except ImportError:
            return FetchResult(None, "error", "yt-dlp not installed")
        out_dir.mkdir(parents=True, exist_ok=True)
        opts = {
            # Detectors only look at frames, so a small video-only stream is enough. Many Shorts
            # expose only split DASH video/audio (no muxed mp4), so muxed-only selectors fail.
            "format": "wv*[height>=360][ext=mp4]/wv*[height>=240]/worst[height>=240]/bv*[height<=720]/b",
            "outtmpl": str(out_dir / "video.%(ext)s"),
            "quiet": True, "no_warnings": True, "noprogress": True,
            "noplaylist": True, "socket_timeout": 15, "retries": 0, "extractor_retries": 0,
            "fragment_retries": 0, "max_filesize": self.max_bytes, "cachedir": False,
            "logger": _QuietLogger(),
        }
        if self.ffmpeg:
            opts["ffmpeg_location"] = self.ffmpeg
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([url])
        except Exception as e:  # yt_dlp.utils.DownloadError and friends
            msg = str(e)
            reason = classify_error(msg)
            # A blocked IP often surfaces as a generic "This video is not available" even for
            # public videos, so repeated generic failures also trip the breaker.
            self._consecutive_errors += 1 if reason != "unavailable" else 0
            if reason == "blocked" or self._consecutive_errors >= self.max_consecutive_errors:
                self._blocked_until = time.time() + self.cooldown_s
                self._consecutive_errors = 0
            log.info("yt-dlp failed (%s): %s", reason, msg[:200])
            return FetchResult(None, reason, msg[:500])
        self._consecutive_errors = 0
        files = [p for p in out_dir.glob("video.*") if not p.name.endswith(".part")]
        if not files:
            return FetchResult(None, "error", "yt-dlp produced no file")
        return FetchResult(files[0])
