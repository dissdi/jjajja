"""Score ensemble + verdict bands (server decides verdict; app never recomputes).

1. decisive positive rule (ok, score>=0.5) -> p = max(p, decisive_floor), verdict likely_ai
2. otherwise weighted mean over status=ok, score!=None, weight>0 signals
3. no strong positive signal -> p = min(p, cap_without_strong)
4. no strong negative signal -> p = max(p, floor_without_strong)   (symmetric to 3: weak or
   uncalibrated evidence alone can't say likely_real either; LOO on eval set, 05_calibration_report)
5. no usable signal -> p = None, verdict unknown
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional


@dataclass
class EnsembleConfig:
    likely_ai: float = 0.75
    uncertain: float = 0.40
    decisive_floor: float = 0.95
    cap_without_strong: Optional[float] = 0.74
    floor_without_strong: Optional[float] = None
    strong_signals: frozenset[str] = frozenset()
    strong_negative_signals: frozenset[str] = frozenset()

    @classmethod
    def from_weights(cls, w: dict) -> "EnsembleConfig":
        th = w.get("thresholds", {}) or {}
        en = w.get("ensemble", {}) or {}
        strong = set(en.get("strong_signals", []) or [])
        strong_neg = set(en.get("strong_negative_signals", []) or [])
        for det_id, dc in (w.get("detectors", {}) or {}).items():
            if (dc or {}).get("calibrated"):
                strong.add(det_id)
                strong_neg.add(det_id)
        return cls(
            likely_ai=float(th.get("likely_ai", 0.75)),
            uncertain=float(th.get("uncertain", 0.40)),
            decisive_floor=float(en.get("decisive_floor", 0.95)),
            cap_without_strong=(None if en.get("cap_without_strong") is None
                                else float(en["cap_without_strong"])),
            floor_without_strong=(None if en.get("floor_without_strong") is None
                                  else float(en["floor_without_strong"])),
            strong_signals=frozenset(strong),
            strong_negative_signals=frozenset(strong_neg),
        )


def _usable(s: dict) -> bool:
    return s.get("status") == "ok" and s.get("score") is not None and (s.get("weight") or 0) > 0


def is_decisive_positive(s: dict) -> bool:
    return bool(s.get("decisive")) and s.get("status") == "ok" and (s.get("score") or 0.0) >= 0.5


def verdict_for(p: Optional[float], decisive_positive: bool, cfg: EnsembleConfig) -> str:
    if decisive_positive:
        return "likely_ai"
    if p is None:
        return "unknown"
    if p >= cfg.likely_ai:
        return "likely_ai"
    if p >= cfg.uncertain:
        return "uncertain"
    return "likely_real"


def combine(signals: Iterable[dict], cfg: EnsembleConfig) -> tuple[Optional[float], str]:
    sigs = list(signals)
    used = [s for s in sigs if _usable(s)]
    decisive = any(is_decisive_positive(s) for s in sigs)

    p: Optional[float] = None
    if used:
        tw = sum(float(s["weight"]) for s in used)
        p = sum(float(s["weight"]) * float(s["score"]) for s in used) / tw
        strong_pos = any(s["id"] in cfg.strong_signals and s["score"] >= 0.5 for s in used)
        if not decisive and not strong_pos and cfg.cap_without_strong is not None:
            p = min(p, cfg.cap_without_strong)
        strong_neg = any(s["score"] < 0.5 and (s["id"] in cfg.strong_negative_signals
                                               or s.get("decisive")) for s in used)
        if not decisive and not strong_neg and cfg.floor_without_strong is not None:
            p = max(p, cfg.floor_without_strong)
    if decisive:
        p = max(p if p is not None else 0.0, cfg.decisive_floor)
    if p is not None:
        p = round(min(max(p, 0.0), 1.0), 4)  # round BEFORE banding so app and server agree
    return p, verdict_for(p, decisive, cfg)
