"""Detection pipeline: URL / upload -> signals -> ensemble -> contract response body.

URL:    normalize -> cache -> [rules.extract_signals || yt-dlp fetch -> sample -> detectors]
Upload: sha256 -> cache -> probe/sample -> detectors  (the main path for real model detection)

`partial` (contract v1.1): true  <=>  no model signal has status "ok" (the video itself was not
analysed, e.g. yt-dlp blocked). Rules-only answers are still returned with ai_probability.

Response-time budget (contract v1.2 "응답 시간", #1): every request gets a monotonic deadline
(URL: JJAJJA_URL_BUDGET_S=40, upload: JJAJJA_UPLOAD_BUDGET_S=110, both shorter than the app's
45 s / 120 s). Rules and the download run in parallel; every stage's timeout is cut to what is
left. At the deadline we stop waiting and answer 200 with whatever finished; unfinished model
signals are status "unavailable" (EVIDENCE_TIMEOUT). Budget-cut answers are NOT cached (a slow
moment should not pin a partial result for hours). Abandoned yt-dlp/ffmpeg threads are fenced by
media.workdir.WorkDir, which deletes the temp folder when the last of them ends.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx
import yaml

from detectors import Registry
from detectors.base import EVIDENCE_TIMEOUT, MediaBundle
from media.fetch import Fetcher, FetchResult
from media.ffmpeg import MediaError, find_ffmpeg, find_ffprobe, probe, sample_clip, sample_uniform
from media.workdir import WorkDir, WorkDirClosed

from . import debug as dbg
from .cache import ResultCache
from .ensemble import EnsembleConfig, combine
from .errors import ApiError
from .schemas import PLATFORMS
from .settings import Settings

log = logging.getLogger(__name__)

# rules is implemented by source-rule-engineer; imported through its fixed public interface only.
from rules import (InvalidUrl, LinkUnresolved, UnsupportedPlatform,  # noqa: E402
                   extract_signals, resolve)

MAX_DURATION_S = 180.0  # contract v1.1 limits.max_duration_s


class BudgetExceeded(Exception):
    """The request's response budget ran out while waiting on a stage."""


def _left(deadline: float) -> float:
    return deadline - time.monotonic()


def _budget_cut(signals: list[dict]) -> bool:
    return any(s["kind"] == "model" and s["status"] == "unavailable"
               and s.get("evidence_ko") == EVIDENCE_TIMEOUT for s in signals)


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
        self.registry.debug = settings.debug  # dev mode: signals carry `debug` (contract v1.3)
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
        from rules import use_store  # rule caches survive restarts, shared by workers (#9)
        use_store(Path(self.s.cache_dir) / "rules.sqlite3")
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
        # contract v1.2 (#2): present is rules' own answer; null whenever the rule did not check
        present = getattr(r, "present", d.get("present"))
        d["present"] = bool(present) if present is not None and d.get("status") == "ok" else None
        out = {k: d[k] for k in ("id", "kind", "status", "decisive", "score", "weight",
                                 "evidence_ko", "via", "present")}
        if self.s.debug:  # rules fill RuleSignal.debug; anything missing gets a generic reason
            dd = dict(getattr(r, "debug", None) or d.get("debug") or {})
            if dd.get("reason") is None and out["status"] != "ok":
                dd["reason"] = f"{out['status']} (no detail from rules)"
            out["debug"] = {"reason": dd.get("reason"), "raw": dd.get("raw")}
        return out

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
        # dev mode (v1.3): keep/redact `debug`; otherwise drop the key. Cached bodies have none.
        sigs = dbg.finalize(body["signals"], self.s.debug, cached=cached)
        return {"request_id": str(uuid.uuid4()), **body, "signals": sigs, "cached": cached}

    def _store(self, key: str, body: dict) -> None:
        if _budget_cut(body["signals"]):
            return  # answer was cut short by the response budget; let the next request retry
        body = {**body, "signals": dbg.strip(body["signals"])}  # debug is never cached
        self.cache.set(key, body, self.s.partial_ttl_s if body["partial"] else self.s.cache_ttl_s)

    async def _staged(self, work: WorkDir, deadline: float, cap: float, fn, *args):
        """Run a blocking media step in `work`, bounded by min(cap, budget left)."""
        rem = _left(deadline)
        if rem <= 0:
            raise BudgetExceeded()
        try:
            return await asyncio.wait_for(work.run(fn, *args), min(cap, rem))
        except asyncio.TimeoutError:
            if rem <= cap:
                raise BudgetExceeded()
            raise MediaError(f"{getattr(fn, '__name__', 'step')} timed out")
        except WorkDirClosed:
            raise BudgetExceeded()

    async def _analyse_file(self, path: Path, work: WorkDir, meta: dict,
                            deadline: float) -> list[dict]:
        """probe + sample + run detectors. Raises MediaError for non-video input,
        BudgetExceeded if the budget ran out before the detectors could start."""
        info = await self._staged(work, deadline, 30.0, probe, path, self.ffmpeg, self.ffprobe)
        meta.update(duration=info.duration, width=info.width, height=info.height)
        if meta.get("platform") == "upload" and info.duration > MAX_DURATION_S:
            raise ApiError("file_too_large", f"duration {info.duration:.1f}s")
        n = int((self.weights.get("detectors", {}).get("commfor_224") or {}).get("frames", 16))
        d3c = self.weights.get("detectors", {}).get("d3") or {}
        # ffmpeg's own subprocess timeout also follows the budget so it does not outlive us long
        ff_t = max(1.0, min(120.0, _left(deadline)))
        res = await asyncio.gather(
            self._staged(work, deadline, 120.0, sample_uniform, path, work.path / "u", n,
                         info.duration, self.ffmpeg, ff_t),
            self._staged(work, deadline, 120.0, sample_clip, path, work.path / "c",
                         int(d3c.get("frames", 16)), float(d3c.get("fps", 8)), info.duration,
                         self.ffmpeg, ff_t), return_exceptions=True)
        for r in res:  # both finished (or were abandoned) -- surface the first failure
            if isinstance(r, BaseException):
                raise r
        frames, clip = res
        if not frames:
            raise MediaError("no frames decoded")
        media = MediaBundle(video_path=path, frames=frames, clip_frames=clip, meta=meta)
        return await self.registry.run_all(media, self.s.detector_timeout_s, deadline=deadline)

    # ------------------------------------------------------------------ URL path
    async def detect_url(self, url: str) -> dict:
        deadline = time.monotonic() + self.s.url_budget_s
        try:
            # short links (bit.ly, kko.to ...) are followed here and spend the URL budget (#7)
            n = await resolve(url, self.http, min(self.s.resolve_timeout_s, _left(deadline)))
        except InvalidUrl as e:
            raise ApiError("invalid_url", str(e))
        except UnsupportedPlatform as e:
            raise ApiError("unsupported_platform", str(e))
        except LinkUnresolved as e:
            raise ApiError("video_unavailable", str(e))

        key = ResultCache.make_key(n.platform, n.video_id, self.version)
        hit = self.cache.get(key)
        if hit is not None:
            return self._respond(hit, cached=True)

        work = WorkDir(self.tmp_root, "url_")
        rules_task = asyncio.create_task(self._rules(n, deadline))
        video_task = asyncio.create_task(self._video(n, work, deadline))
        try:
            # both tasks bound themselves by `deadline`; neither raises
            rule_sigs, (fetched, model_sigs) = await asyncio.gather(rules_task, video_task)
        finally:
            for t in (rules_task, video_task):
                t.cancel()
            work.close()  # deleted now, or by the last abandoned worker thread

        signals = rule_sigs + model_sigs
        body = self._finish(platform=n.platform, video_id=n.video_id, signals=signals)
        if (fetched is not None and fetched.path is None and fetched.reason == "unavailable"
                and body["ai_probability"] is None):
            # private / deleted / geo-blocked and no metadata signal to fall back on
            raise ApiError("video_unavailable", fetched.message[:200])
        self._store(key, body)
        return self._respond(body, cached=False)

    async def _rules(self, n, deadline: float) -> list[dict]:
        assert self.http is not None
        t = min(self.s.rules_timeout_s, _left(deadline))
        if t <= 0:
            return []
        try:
            sigs = await asyncio.wait_for(extract_signals(n, self.http), t)
        except Exception:  # timeout; extract_signals itself never raises
            log.warning("rules timed out for %s (%.1fs)", n.video_id, t)
            return []
        return [self._rule_signal_dict(r) for r in sigs]

    async def _video(self, n, work: WorkDir, deadline: float
                     ) -> tuple[Optional[FetchResult], list[dict]]:
        """Download + analyse within the budget. Never raises (except ApiError from analysis)."""
        timeout_sigs = lambda: self.registry.unavailable_signals(  # noqa: E731
            EVIDENCE_TIMEOUT, "budget cut")
        rem = _left(deadline)
        if rem <= 0:
            return None, timeout_sigs()
        t = min(self.s.fetch_timeout_s, rem)
        try:
            fetched: FetchResult = await asyncio.wait_for(
                work.run(self.fetcher.fetch, n.canonical_url, work.path / "dl"), t)
        except asyncio.TimeoutError:
            if rem <= self.s.fetch_timeout_s:
                log.warning("URL budget exhausted while downloading %s", n.video_id)
                return None, timeout_sigs()
            fetched = FetchResult(None, "error", "fetch timeout")
        except WorkDirClosed:
            return None, timeout_sigs()
        if fetched.path is None:
            return fetched, self.registry.unavailable_signals(
                reason=f"video not fetched ({fetched.reason}: {fetched.message[:120]})")
        try:
            sigs = await self._analyse_file(
                fetched.path, work, {"platform": n.platform, "video_id": n.video_id}, deadline)
        except BudgetExceeded:
            log.warning("URL budget exhausted while sampling %s", n.video_id)
            sigs = timeout_sigs()
        except MediaError as e:
            log.warning("downloaded file undecodable for %s", n.video_id)
            sigs = self.registry.unavailable_signals(reason=f"media undecodable: {e}")
        return fetched, sigs

    # ------------------------------------------------------------------ upload path
    async def detect_upload(self, path: Path, sha256: str) -> dict:
        """`path` is owned by the caller. Budget starts here (upload transfer excluded)."""
        deadline = time.monotonic() + self.s.upload_budget_s
        key = ResultCache.make_key("upload", sha256, self.version)
        hit = self.cache.get(key)
        if hit is not None:
            return self._respond(hit, cached=True)
        work = WorkDir(self.tmp_root, "upf_")
        try:
            model_sigs = await self._analyse_file(path, work, {"platform": "upload", "sha256": sha256},
                                                  deadline)
        except BudgetExceeded:
            log.warning("upload budget exhausted before detectors ran")
            model_sigs = self.registry.unavailable_signals(EVIDENCE_TIMEOUT, "budget cut")
        except MediaError as e:
            raise ApiError("invalid_file", str(e))
        finally:
            work.close()
        if not any(s["status"] == "ok" for s in model_sigs):
            raise ApiError("detectors_down", "no model detector produced a score")
        body = self._finish(platform="upload", video_id=None, signals=model_sigs)
        self._store(key, body)
        return self._respond(body, cached=False)
