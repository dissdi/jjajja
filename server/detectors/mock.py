"""Deterministic fake detector for tests/dev. Enabled only with JJAJJA_ENABLE_MOCK=1."""
from __future__ import annotations

import hashlib

from .base import Detector, DetectorResult, MediaBundle, band


class MockDetector(Detector):
    id = "mock"
    version = "1"

    def infer(self, media: MediaBundle) -> DetectorResult:
        fixed = self.cfg.get("fixed_score")
        if fixed is not None:
            s = float(fixed)
        else:
            h = hashlib.sha256()
            for f in media.frames[:2]:
                h.update(f.read_bytes())
            s = int(h.hexdigest()[:8], 16) / 0xFFFFFFFF
        return DetectorResult(
            score=s, status="ok",
            evidence_ko=band(s, "테스트용 확인 결과: AI 가능성이 높게 나왔어요",
                             "테스트용 확인 결과: 판단하기 어려워요",
                             "테스트용 확인 결과: AI 흔적이 적게 나왔어요"),
            raw={"score": s})
