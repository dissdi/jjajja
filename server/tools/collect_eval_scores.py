"""Download eval/dataset.csv videos one at a time, extract raw detector scores, delete the video.

  cd server && python -m tools.collect_eval_scores --out ../_workspace/05_raw_scores.csv

Policy (user decision 2026-09-28, small evaluation/calibration set only):
  * >= --sleep seconds (default 10) between platform requests, no retries (Fetcher retries=0).
  * Any bot-block / captcha / 429 sign (Fetcher reason "blocked", or its breaker "cooldown")
    stops the run immediately; rows collected so far are kept.
  * Video files live only under server/.cache/eval_tmp/ (gitignored) and are deleted right after
    scoring. Only scores/metadata are written to the CSV — never the video.

TERMS-OF-SERVICE RISK: see media/fetch.py. Research use only; legal review before launch.
"""
from __future__ import annotations

import argparse
import csv
import re
import shutil
import sys
import time
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.settings import Settings  # noqa: E402
from detectors import Registry  # noqa: E402
from media.ffmpeg import find_ffmpeg, find_ffprobe  # noqa: E402
from media.fetch import Fetcher  # noqa: E402
from tools.score_file import score_path  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
FIELDS = ["url", "label", "label_source", "video_id", "fetch_status", "fetch_msg", "ext",
          "bytes", "duration", "d3_raw", "d3_nframes", "d3_status", "commfor_raw",
          "commfor_top25", "commfor_status", "d3_score_before", "commfor_score_before"]


def video_id(url: str) -> str:
    m = re.search(r"(?:shorts/|v=|youtu\.be/)([A-Za-z0-9_-]{11})", url)
    return m.group(1) if m else ""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", default=str(ROOT.parent / "eval" / "dataset.csv"))
    ap.add_argument("--out", required=True)
    ap.add_argument("--sleep", type=float, default=10.0)
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()

    s = Settings.from_env()
    w = yaml.safe_load(Path(s.weights_path).read_text())
    reg = Registry(["d3", "commfor_224"], w.get("detectors", {}), s.resolved_device())
    reg.load_all()
    print(f"# device={reg.device} health={reg.health()}", file=sys.stderr)
    ff, fp = find_ffmpeg(s.ffmpeg), find_ffprobe(s.ffprobe)
    fetcher = Fetcher(enabled=True, ffmpeg=ff)
    tmp_root = ROOT / ".cache" / "eval_tmp"

    rows = list(csv.DictReader(open(a.dataset, encoding="utf-8")))
    if a.limit:
        rows = rows[: a.limit]
    out_f = open(a.out, "w", newline="", encoding="utf-8")
    wr = csv.DictWriter(out_f, fieldnames=FIELDS)
    wr.writeheader()
    last_req = 0.0
    stopped = ""
    for i, r in enumerate(rows):
        vid = video_id(r["url"])
        gap = a.sleep - (time.time() - last_req)
        if last_req and gap > 0:
            time.sleep(gap)
        last_req = time.time()
        d = tmp_root / vid
        rec = {"url": r["url"], "label": r["label"], "label_source": r["label_source"],
               "video_id": vid}
        try:
            fr = fetcher.fetch(r["url"], d)
            if fr.path is None:
                rec.update(fetch_status=fr.reason, fetch_msg=fr.message[:160].replace("\n", " "))
                print(f"[{i+1}/{len(rows)}] {vid} FETCH {fr.reason}: {fr.message[:120]}",
                      file=sys.stderr)
                if fr.reason in ("blocked", "cooldown"):
                    stopped = f"{vid}: {fr.reason}: {fr.message[:200]}"
            else:
                rec.update(fetch_status="ok", ext=fr.path.suffix.lstrip("."),
                           bytes=fr.path.stat().st_size)
                o = score_path(reg, fr.path, ff, fp)
                d3, cf = o.get("d3", {}), o.get("commfor_224", {})
                rec.update(duration=round(o["duration"] or 0, 2),
                           d3_status=d3.get("status"), commfor_status=cf.get("status"),
                           d3_raw=(d3.get("raw") or {}).get("d2_std"),
                           d3_nframes=(d3.get("raw") or {}).get("n_frames"),
                           commfor_raw=(cf.get("raw") or {}).get("mean"),
                           commfor_top25=(cf.get("raw") or {}).get("top25"),
                           d3_score_before=d3.get("score"), commfor_score_before=cf.get("score"))
                print(f"[{i+1}/{len(rows)}] {vid} {r['label']} d3={rec['d3_raw']} "
                      f"cf={rec['commfor_raw']}", file=sys.stderr)
        finally:
            shutil.rmtree(d, ignore_errors=True)  # never keep the video
        wr.writerow(rec)
        out_f.flush()
        if stopped:
            print(f"# STOP (bot-block sign): {stopped}", file=sys.stderr)
            break
    out_f.close()
    shutil.rmtree(tmp_root, ignore_errors=True)


if __name__ == "__main__":
    main()
