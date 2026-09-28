"""Detection pipeline: URL / upload -> signals -> ensemble -> contract response body.

URL:    normalize -> cache -> [rules.extract_signals || yt-dlp fetch -> sample -> detectors]
Upload: sha256 -> cache -> probe/sample -> detectors  (the main path for real model detection)

`partial` (contract v1.1): true  <=>  no model signal has status "ok" (the video itself was not
analysed, e.g. yt-dlp blocked). Rules-only answers are still returned with ai_probability.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import shutil
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx
import yaml

from detectors import Registry
from detectors.base import MediaBundle
from media.fetch import Fetcher, FetchResult
from media.ffmpeg import MediaError, find_ffmpeg, find_ffprobe, probe, sample_clip, sample_uniform

from .cache import ResultCache
from .ensemble import EnsembleConfig, combine
from .errors import ApiError
from .schemas import PLATFORMS
from .settings import Settings

log = logging.getLogger(__name__)

# rules is implemented by source-rule-engineer; imported through its fixed public interface only.
from rules import InvalidUrl, UnsupportedPlatform, extract_signals, normalize  # noqa: E402

MAX_DURATION_S = 180.0  # contract v1.1 limits.max_duration_s


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Pipeline:
    def __init__(self, settings: Settings, registry: Optional[Registry] = None,
                 fetcher: Optional[Fetcher] = None, cache: Optional[ResultCache] = None):
        self.s = settings
        self.weights_text = Path(settings.weights_path).read_text(encoding="utf-8")
        self.weights = yaml.safe_load(self.weights_text) or {}
        self.ens = EnsembleConfig.from_weights(self.weights)
        det_cfg = dict(self.weights.get("detectors", {}) or {})
        ids = list(settings.detectors)
        if settings.enable_mock and "mock" not in ids:
            ids.insert(0, "mock")
        if settings.mock_score is not None:
            det_cfg.setdefault("mock", {})
            det_cfg["mock"] = {**(det_cfg["mock"] or {}), "fixed_score": settings.mock_score}
        self.registry = registry or Registry(ids, det_cfg, settings.resolved_device())
        self.ffmpeg = find_ffmpeg(settings.ffmpeg)
        self.ffprobe = find_ffprobe(settings.ffprobe)
        self.fetcher = fetcher or Fetcher(settings.fetch_enabled, settings.fetch_cooldown_s,
                                          ffmpeg=self.ffmpeg)
        self.cache = cache or ResultCache(settings.cache_dir)
        self.tmp_root = Path(settings.cache_dir) / "tmp"
        self.tmp_root.mkdir(parents=True, exist_ok=True)
        self.rule_overrides = dict((self.weights.get("rules", {}) or {}).get("overrides", {}) or {})
        self.http: Optional[httpx.AsyncClient] = None

    # ------------------------------------------------------------------ lifecycle
    async def start(self) -> None:
        self.http = httpx.AsyncClient(timeout=10.0, follow_redirects=False)
        await asyncio.to_thread(self.registry.load_all)
        self._version = hashlib.sha1(
            (self.weights_text + "|" + self.registry.version_tag()).encode()).hexdigest()[:12]

    async def stop(self) -> None:
        if self.http:
            await self.http.aclose()

    @property
    def version(self) -> str:
        return getattr(self, "_version", "init")

    # ------------------------------------------------------------------ helpers
    def _rule_signal_dict(self, r) -> dict:
        d = r.to_dict() if hasattr(r, "to_dict") else dict(r.__dict__)
        d["kind"] = "rule"
        if d.get("id") in self.rule_overrides:
            d["weight"] = float(self.rule_overrides[d["id"]])
        if d.get("score") is not None:
            d["score"] = round(min(max(float(d["score"]), 0.0), 1.0), 4)
        d["weight"] = max(0.0, float(d.get("weight") or 0.0))
        if d.get("via") not in {"api", "oembed", "html"}:
            d["via"] = "html"
        d["evidence_ko"] = d.get("evidence_ko") or ""
        return {k: d[k] for k in ("id", "kind", "status", "decisive", "score", "weight",
                                  "evidence_ko", "via")}

    def _finish(self, *, platform: str, video_id: Optional[str], signals: list[dict]) -> dict:
        p, verdict = combine(signals, self.ens)
        partial = not any(s["kind"] == "model" and s["status"] == "ok" for s in signals)
        return {
            "platform": platform if platform in PLATFORMS else "unknown",
            "video_id": video_id,
            "ai_probability": p,
            "verdict": verdict,
            "partial": partial,
            "signals": signals,
            "analyzed_at": _now_iso(),
        }

    def _respond(self, body: dict, cached: bool) -> dict:
        return {"request_id": str(uuid.uuid4()), **body, "cached": cached}

    def _store(self, key: str, body: dict) -> None:
        self.cache.set(key, body, self.s.partial_ttl_s if body["partial"] else self.s.cache_ttl_s)

    async def _analyse_file(self, path: Path, work: Path, meta: dict) -> list[dict]:
        """probe + sample + run detectors. Raises MediaError for non-video input."""
        info = await asyncio.to_thread(probe, path, self.ffmpeg, self.ffprobe)
        meta.update(duration=info.duration, width=info.width, height=info.height)
        if meta.get("platform") == "upload" and info.duration > MAX_DURATION_S:
            raise ApiError("file_too_large", f"duration {info.duration:.1f}s")
        n = int((self.weights.get("detectors", {}).get("commfor_224") or {}).get("frames", 16))
        d3c = self.weights.get("detectors", {}).get("d3") or {}
        frames, clip = await asyncio.gather(
            asyncio.to_thread(sample_uniform, path, work / "u", n, info.duration, self.ffmpeg),
            asyncio.to_thread(sample_clip, path, work / "c", int(d3c.get("frames", 16)),
                              float(d3c.get("fps", 8)), info.duration, self.ffmpeg))
        if not frames:
            raise MediaError("no frames decoded")
        media = MediaBundle(video_path=path, frames=frames, clip_frames=clip, meta=meta)
        return await self.registry.run_all(media, self.s.detector_timeout_s)

    # ------------------------------------------------------------------ URL path
    async def detect_url(self, url: str) -> dict:
        try:
            n = normalize(url)
        except InvalidUrl as e:
            raise ApiError("invalid_url", str(e))
        except UnsupportedPlatform as e:
            raise ApiError("unsupported_platform", str(e))

        key = ResultCache.make_key(n.platform, n.video_id, self.version)
        hit = self.cache.get(key)
        if hit is not None:
            return self._respond(hit, cached=True)

        work = Path(tempfile.mkdtemp(prefix="url_", dir=self.tmp_root))
        try:
            rules_task = asyncio.create_task(self._rules(n))
            fetched: FetchResult = await self._fetch(n.canonical_url, work)
            if fetched.path is not None:
                try:
                    model_sigs = await self._analyse_file(
                        fetched.path, work, {"platform": n.platform, "video_id": n.video_id})
                except MediaError:
                    log.warning("downloaded file undecodable for %s", n.video_id)
                    model_sigs = self.registry.unavailable_signals()
            else:
                model_sigs = self.registry.unavailable_signals()
            rule_sigs = await rules_task
        finally:
            shutil.rmtree(work, ignore_errors=True)

        signals = rule_sigs + model_sigs
        body = self._finish(platform=n.platform, video_id=n.video_id, signals=signals)
        if fetched.path is None and fetched.reason == "unavailable" and body["ai_probability"] is None:
            # private / deleted / geo-blocked and no metadata signal to fall back on
            raise ApiError("video_unavailable", fetched.message[:200])
        self._store(key, body)
        return self._respond(body, cached=False)

    async def _rules(self, n) -> list[dict]:
        assert self.http is not None
        try:
            sigs = await asyncio.wait_for(extract_signals(n, self.http), self.s.rules_timeout_s)
        except Exception:  # timeout; extract_signals itself never raises
            log.warning("rules timed out for %s", n.video_id)
            return []
        return [self._rule_signal_dict(r) for r in sigs]

    async def _fetch(self, url: str, work: Path) -> FetchResult:
        try:
            return await asyncio.wait_for(asyncio.to_thread(self.fetcher.fetch, url, work / "dl"),
                                          self.s.fetch_timeout_s)
        except asyncio.TimeoutError:
            return FetchResult(None, "error", "fetch timeout")

    # ------------------------------------------------------------------ upload path
    async def detect_upload(self, path: Path, sha256: str) -> dict:
        key = ResultCache.make_key("upload", sha256, self.version)
        hit = self.cache.get(key)
        if hit is not None:
            return self._respond(hit, cached=True)
        work = path.parent
        try:
            model_sigs = await self._analyse_file(path, work, {"platform": "upload", "sha256": sha256})
        except MediaError as e:
            raise ApiError("invalid_file", str(e))
        if not any(s["status"] == "ok" for s in model_sigs):
            raise ApiError("detectors_down", "no model detector produced a score")
        body = self._finish(platform="upload", video_id=None, signals=model_sigs)
        self._store(key, body)
        return self._respond(body, cached=False)
