"""Detector registry. Add a detector = add a module + one line in FACTORIES.

A detector that fails to load is kept in the registry as "down": it appears in /v1/health as
"down" and in every response as a model signal with status="unavailable" (weight excluded).
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Callable, Optional

from .base import (EVIDENCE_DOWN, EVIDENCE_ERROR, EVIDENCE_NO_VIDEO, EVIDENCE_TIMEOUT, Detector,
                   DetectorResult, MediaBundle)

log = logging.getLogger(__name__)


def _mock(cfg, device):
    from .mock import MockDetector
    return MockDetector(cfg, device)


def _d3(cfg, device):
    from .d3 import D3Detector
    return D3Detector(cfg, device)


def _commfor(cfg, device):
    from .commfor import CommForDetector
    return CommForDetector(cfg, device)


FACTORIES: dict[str, Callable[[dict, str], Detector]] = {
    "mock": _mock,
    "d3": _d3,
    "commfor_224": _commfor,
}


@dataclass
class Handle:
    id: str
    weight: float
    detector: Optional[Detector] = None
    ok: bool = False
    error: str = ""
    version: str = "0"
    load_s: float = 0.0
    last_infer_s: Optional[float] = None
    extra: dict = field(default_factory=dict)


class Registry:
    def __init__(self, ids: list[str], det_cfg: dict, device: str = "cpu"):
        self.device = device
        self.handles: list[Handle] = []
        for i in ids:
            cfg = dict(det_cfg.get(i, {}) or {})
            self.handles.append(Handle(id=i, weight=float(cfg.get("weight", 1.0)), extra=cfg))

    def load_all(self) -> None:
        for h in self.handles:
            t0 = time.perf_counter()
            fac = FACTORIES.get(h.id)
            if fac is None:
                h.ok, h.error = False, "unknown detector id"
                continue
            try:
                d = fac(h.extra, self.device)
                d.load()
                h.detector, h.ok, h.version = d, True, d.version
            except Exception as e:  # missing weights, no network, OOM, ...
                h.ok, h.error = False, f"{type(e).__name__}: {e}"[:300]
                log.warning("detector %s unavailable: %s", h.id, h.error)
            h.load_s = time.perf_counter() - t0

    def health(self) -> dict[str, str]:
        return {h.id: ("ok" if h.ok else "down") for h in self.handles}

    def version_tag(self) -> str:
        return ",".join(f"{h.id}={h.version if h.ok else 'down'}" for h in self.handles)

    @staticmethod
    def _signal(h: Handle, r: DetectorResult) -> dict:
        return {"id": h.id, "kind": "model", "status": r.status, "decisive": False,
                "score": None if r.score is None else round(float(r.score), 4),
                "weight": h.weight, "evidence_ko": r.evidence_ko, "via": "model",
                "present": None}  # contract v1.2: `present` is rule-only; models always null

    def unavailable_signals(self, evidence: str = EVIDENCE_NO_VIDEO) -> list[dict]:
        out = []
        for h in self.handles:
            ev = evidence if h.ok else EVIDENCE_DOWN
            out.append(self._signal(h, DetectorResult(None, "unavailable", ev)))
        return out

    async def run_all(self, media: MediaBundle, timeout_s: float,
                      deadline: Optional[float] = None) -> list[dict]:
        """Run every detector concurrently.

        `deadline` is a `time.monotonic()` instant (the request's response budget, #1). Each
        attempt's timeout is cut to what is left of it; a detector still running at the deadline
        becomes status="unavailable" with EVIDENCE_TIMEOUT (its thread is abandoned, not awaited).
        """
        def left() -> Optional[float]:
            return None if deadline is None else deadline - time.monotonic()

        def budget_out() -> DetectorResult:
            return DetectorResult(None, "unavailable", EVIDENCE_TIMEOUT)

        async def one(h: Handle) -> dict:
            if not h.ok or h.detector is None:
                return self._signal(h, DetectorResult(None, "unavailable", EVIDENCE_DOWN))
            retries = int(h.extra.get("retries", 0))  # remote APIs: 1; local models: 0
            for attempt in range(retries + 1):
                rem = left()
                if rem is not None and rem <= 0:
                    return self._signal(h, budget_out())
                t = timeout_s if rem is None else min(timeout_s, rem)
                t0 = time.perf_counter()
                try:
                    r = await asyncio.wait_for(asyncio.to_thread(h.detector.infer, media), t)
                    h.last_infer_s = time.perf_counter() - t0
                    log.info("detector %s score=%s raw=%s %.2fs", h.id, r.score, r.raw, h.last_infer_s)
                    return self._signal(h, r)
                except asyncio.TimeoutError:
                    if rem is not None and rem <= timeout_s:  # cut by the response budget
                        log.warning("detector %s: response budget exhausted", h.id)
                        return self._signal(h, budget_out())
                    log.warning("detector %s timeout (attempt %d)", h.id, attempt + 1)
                except Exception:
                    log.exception("detector %s failed", h.id)
                    break
            return self._signal(h, DetectorResult(None, "error", EVIDENCE_ERROR))

        return list(await asyncio.gather(*(one(h) for h in self.handles)))
