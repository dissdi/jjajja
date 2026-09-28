"""Detector adapter interface (ai-video-detection skill §2).

A detector = one file in server/detectors/, registered in detectors/__init__.py. Local models
implement `load()` (may raise -> detector reported "down"/"unavailable") and `infer()` (blocking,
runs in a worker thread). Signals ids are exposed verbatim as `signals[].id`.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Optional

Status = Literal["ok", "error", "unavailable"]


@dataclass
class MediaBundle:
    video_path: Optional[Path]
    frames: list[Path]                 # uniform N frames, 256x256 center-square
    clip_frames: list[Path] = field(default_factory=list)  # consecutive frames @ clip fps
    audio_path: Optional[Path] = None
    meta: dict = field(default_factory=dict)  # platform, video_id, duration, width, height


@dataclass
class DetectorResult:
    score: Optional[float]             # 0~1, probability of AI (after calibration)
    status: Status
    evidence_ko: str
    raw: dict = field(default_factory=dict)  # logged only, never sent to clients


class Detector:
    id: str = "base"
    kind: str = "model"
    version: str = "0"

    def __init__(self, cfg: dict, device: str = "cpu"):
        self.cfg = cfg or {}
        self.device = device

    def load(self) -> None:  # pragma: no cover - trivial default
        pass

    def infer(self, media: MediaBundle) -> DetectorResult:
        raise NotImplementedError

    # --- helpers
    def calibrate(self, raw: float) -> float:
        c = self.cfg.get("calibration")
        if not c:
            return float(min(max(raw, 0.0), 1.0))
        z = float(c.get("a", 1.0)) * (raw - float(c.get("b", 0.0)))
        return 1.0 / (1.0 + math.exp(-max(min(z, 60.0), -60.0)))


def band(score: float, high: str, mid: str, low: str) -> str:
    """Pick plain-Korean evidence by the same bands as the verdict table."""
    if score >= 0.75:
        return high
    if score >= 0.40:
        return mid
    return low


EVIDENCE_NO_VIDEO = "영상을 받아오지 못해 화면은 확인하지 못했어요"
EVIDENCE_DOWN = "지금은 화면 확인 기능을 쓸 수 없어요"
EVIDENCE_ERROR = "화면을 확인하다가 문제가 생겼어요"
# response-time budget ran out before this check finished (contract v1.2 "응답 시간", #1)
EVIDENCE_TIMEOUT = "시간이 오래 걸려서 이번에는 화면을 확인하지 못했어요"
