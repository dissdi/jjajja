"""Download eval/dataset.csv videos one at a time, get Hive + CommFor raw scores, delete the video.

  cd server && python -m tools.collect_hive_scores --out ../_workspace/06_hive_scores.csv

Same download policy as tools/collect_eval_scores.py (user decision 2026-09-28):
  * >= --sleep s (default 10) between platform requests, no retries; any bot-block sign stops.
  * Videos live only under server/.cache/eval_tmp/ and are deleted right after scoring.
Hive cost guard (issue #3): frames are counted from each reply (1 fps, first 20 s only);
at --usd-per-1000 (default 6) the run stops as soon as the cumulative cost would exceed
--max-usd (default 10) — checked before each call (projected) and after it (actual).

HIVE_API_KEY comes from the environment / server/.env (app.settings.load_env_file). Never printed.
"""
from __future__ import annotations

import argparse
import csv
import shutil
import sys
import time
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.settings import Settings  # noqa: E402
from detectors import Registry  # noqa: E402
from detectors.base import MediaBundle  # noqa: E402
from media.ffmpeg import find_ffmpeg, find_ffprobe, probe, sample_uniform  # noqa: E402
from media.fetch import Fetcher  # noqa: E402
from tools.collect_eval_scores import video_id  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
HIVE_KEYS = ["ai_mean", "ai_top25", "ai_max", "deepfake_mean", "deepfake_max", "audio_ai_mean",
             "audio_ai_max", "inconclusive_max", "inconclusive_video_max", "top_generator",
             "top_generator_score", "n_frames", "clip", "clip_bytes"]
FIELDS = (["url", "label", "label_source", "video_id", "fetch_status", "fetch_msg", "ext", "bytes",
           "duration", "width", "height", "has_audio", "commfor_raw", "commfor_top25", "commfor_status",
           "hive_status", "hive_error"] + [f"hive_{k}" for k in HIVE_KEYS] + ["hive_per_frame",
           "cum_frames", "cum_usd"])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", default=str(ROOT.parent / "eval" / "dataset.csv"))
    ap.add_argument("--out", required=True)
    ap.add_argument("--sleep", type=float, default=10.0)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--max-usd", type=float, default=10.0)
    ap.add_argument("--usd-per-1000", type=float, default=6.0)
    a = ap.parse_args()

    s = Settings.from_env()  # loads server/.env (HIVE_API_KEY) without printing it
    w = yaml.safe_load(Path(s.weights_path).read_text())
    reg = Registry(["commfor_224", "hive"], w.get("detectors", {}), "cpu")
    reg.load_all()
    health = reg.health()
    print(f"# health={health}", file=sys.stderr)
    if health.get("hive") != "ok":
        sys.exit("hive detector is down (HIVE_API_KEY missing?) - abort before downloading")
    cf = next(h for h in reg.handles if h.id == "commfor_224").detector
    hv = next(h for h in reg.handles if h.id == "hive").detector
    max_s = float(getattr(hv, "max_seconds", 20))
    ff, fp = find_ffmpeg(s.ffmpeg), find_ffprobe(s.ffprobe)
    fetcher = Fetcher(enabled=True, ffmpeg=ff)
    tmp_root = ROOT / ".cache" / "eval_tmp"

    rows = list(csv.DictReader(open(a.dataset, encoding="utf-8")))
    if a.limit:
        rows = rows[: a.limit]
    out_f = open(a.out, "w", newline="", encoding="utf-8")
    wr = csv.DictWriter(out_f, fieldnames=FIELDS)
    wr.writeheader()
    usd = lambda fr: fr * a.usd_per_1000 / 1000  # noqa: E731
    cum_frames, last_req, stopped = 0, 0.0, ""
    for i, r in enumerate(rows):
        vid = video_id(r["url"])
        gap = a.sleep - (time.time() - last_req)
        if last_req and gap > 0:
            time.sleep(gap)
        last_req = time.time()
        d = tmp_root / vid
        rec = {"url": r["url"], "label": r["label"], "label_source": r["label_source"], "video_id": vid}
        try:
            fr = fetcher.fetch(r["url"], d)
            if fr.path is None:
                rec.update(fetch_status=fr.reason, fetch_msg=fr.message[:160].replace("\n", " "))
                print(f"[{i+1}/{len(rows)}] {vid} FETCH {fr.reason}: {fr.message[:120]}", file=sys.stderr)
                if fr.reason in ("blocked", "cooldown"):
                    stopped = f"{vid}: bot-block sign: {fr.reason}: {fr.message[:200]}"
            else:
                info = probe(fr.path, ff, fp)
                rec.update(fetch_status="ok", ext=fr.path.suffix.lstrip("."), bytes=fr.path.stat().st_size,
                           duration=round(info.duration, 2), width=info.width, height=info.height,
                           has_audio=info.has_audio)
                frames = sample_uniform(fr.path, d / "u", 16, info.duration, ff)
                media = MediaBundle(fr.path, frames, meta={"duration": info.duration})
                c = cf.infer(media)
                rec.update(commfor_status=c.status, commfor_raw=c.raw.get("mean"),
                           commfor_top25=c.raw.get("top25"))
                projected = cum_frames + int(min(info.duration, max_s)) + 2
                if usd(projected) > a.max_usd:
                    stopped = f"cost guard: projected ${usd(projected):.2f} > ${a.max_usd}"
                    rec.update(hive_status="skipped_cost")
                else:
                    h = hv.infer(media)
                    rec.update(hive_status=h.status, hive_error=h.raw.get("error", ""))
                    if h.status == "ok":
                        rec.update({f"hive_{k}": h.raw.get(k) for k in HIVE_KEYS})
                        rec["hive_per_frame"] = " ".join(str(x) for x in h.raw.get("per_frame", []))
                        cum_frames += int(h.raw.get("n_frames") or 0)
                    if usd(cum_frames) > a.max_usd:
                        stopped = f"cost guard: ${usd(cum_frames):.2f} > ${a.max_usd}"
                    if h.status == "unavailable" and "http 429" in rec["hive_error"]:
                        stopped = "hive 429 (rate limited)"
                print(f"[{i+1}/{len(rows)}] {vid} {r['label']} cf={rec.get('commfor_raw')} "
                      f"hive={rec.get('hive_status')}:{rec.get('hive_ai_mean')} gen={rec.get('hive_top_generator')} "
                      f"frames={cum_frames} ${usd(cum_frames):.2f}", file=sys.stderr)
        finally:
            shutil.rmtree(d, ignore_errors=True)  # never keep the video
        rec.update(cum_frames=cum_frames, cum_usd=round(usd(cum_frames), 3))
        wr.writerow(rec)
        out_f.flush()
        if stopped:
            print(f"# STOP: {stopped}", file=sys.stderr)
            break
    out_f.close()
    shutil.rmtree(tmp_root, ignore_errors=True)
    print(f"# done frames={cum_frames} usd={usd(cum_frames):.2f} stopped={stopped or 'no'}", file=sys.stderr)


if __name__ == "__main__":
    main()
