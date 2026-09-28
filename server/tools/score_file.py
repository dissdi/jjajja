"""Print raw + calibrated detector scores for local video files (for Platt calibration in QA).

  cd server && python -m tools.score_file a.mp4 b.mp4 [--detectors d3,commfor_224] [--json]

Device follows JJAJJA_DEVICE / CUDA_VISIBLE_DEVICES (see app/settings.py; GPU only when pinned
after checking GPU owners on the shared server).
"""
from __future__ import annotations

import argparse
import json
import sys
import tempfile
import time
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.settings import Settings  # noqa: E402
from detectors import Registry  # noqa: E402
from detectors.base import MediaBundle  # noqa: E402
from media.ffmpeg import find_ffmpeg, find_ffprobe, probe, sample_clip, sample_uniform  # noqa: E402


def score_path(reg: Registry, f: Path, ff: str, fp: str) -> dict:
    """Sample frames exactly like the pipeline and return raw + calibrated scores per detector."""
    with tempfile.TemporaryDirectory() as td:
        t1 = time.perf_counter()
        info = probe(f, ff, fp)
        u = sample_uniform(f, Path(td) / "u", 16, info.duration, ff)
        c = sample_clip(f, Path(td) / "c", 16, 8, info.duration, ff)
        t2 = time.perf_counter()
        media = MediaBundle(f, u, c, meta={"duration": info.duration})
        out = {"file": str(f), "duration": info.duration, "sample_s": round(t2 - t1, 2)}
        for h in reg.handles:
            if not h.ok:
                out[h.id] = {"status": "down", "error": h.error}
                continue
            t3 = time.perf_counter()
            r = h.detector.infer(media)
            out[h.id] = {"score": r.score, "raw": r.raw, "status": r.status,
                         "infer_s": round(time.perf_counter() - t3, 2)}
        return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--detectors", default="d3,commfor_224")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    s = Settings.from_env()
    w = yaml.safe_load(Path(s.weights_path).read_text())
    reg = Registry(a.detectors.split(","), w.get("detectors", {}), s.resolved_device())
    t0 = time.perf_counter()
    reg.load_all()
    print(f"# device={reg.device} load={time.perf_counter() - t0:.1f}s health={reg.health()}",
          file=sys.stderr)
    ff, fp = find_ffmpeg(s.ffmpeg), find_ffprobe(s.ffprobe)
    for f in a.files:
        out = score_path(reg, Path(f), ff, fp)
        print(json.dumps(out, ensure_ascii=False) if a.json else out)


if __name__ == "__main__":
    main()
