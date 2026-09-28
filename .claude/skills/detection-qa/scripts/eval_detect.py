#!/usr/bin/env python3
"""라벨된 URL 데이터셋으로 /v1/detect 를 호출해 정확도 지표를 계산한다.

Usage:
  python eval_detect.py --dataset eval/dataset.csv \
      --endpoint http://localhost:8000/v1/detect --out _workspace/04_eval_results.csv
"""
import argparse
import csv
import json
import sys
import urllib.error
import urllib.request
from collections import Counter, defaultdict


def call(endpoint: str, url: str, timeout: float) -> dict:
    body = json.dumps({"url": url, "source": "paste"}).encode()
    req = urllib.request.Request(endpoint, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return {"error": json.load(e).get("error", {"code": f"http_{e.code}"})}
        except Exception:
            return {"error": {"code": f"http_{e.code}"}}
    except Exception as e:  # 네트워크/타임아웃
        return {"error": {"code": "client_error", "message_ko": str(e)}}


def auc(pairs):
    """pairs: [(score, is_ai)] — Mann-Whitney 방식."""
    pos = [s for s, y in pairs if y]
    neg = [s for s, y in pairs if not y]
    if not pos or not neg:
        return None
    wins = sum((p > n) + 0.5 * (p == n) for p in pos for n in neg)
    return wins / (len(pos) * len(neg))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True)
    ap.add_argument("--endpoint", default="http://localhost:8000/v1/detect")
    ap.add_argument("--out", default="_workspace/04_eval_results.csv")
    ap.add_argument("--timeout", type=float, default=120)
    a = ap.parse_args()

    rows = list(csv.DictReader(open(a.dataset, encoding="utf-8")))
    results = []
    per_detector = defaultdict(list)
    for i, row in enumerate(rows, 1):
        res = call(a.endpoint, row["url"], a.timeout)
        is_ai = row["label"].strip() == "ai"
        verdict = res.get("verdict", "error:" + res.get("error", {}).get("code", "?"))
        p = res.get("ai_probability")
        results.append({**row, "verdict": verdict, "ai_probability": p,
                        "partial": res.get("partial"),
                        "top_signals": ";".join(s["id"] for s in res.get("signals", []) if s.get("status") == "ok")})
        for s in res.get("signals", []):
            if s.get("status") == "ok" and s.get("score") is not None:
                per_detector[s["id"]].append((s["score"], is_ai))
        print(f"[{i}/{len(rows)}] {row['label']:>4} → {verdict} ({p})", file=sys.stderr)

    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(results[0].keys()) if results else ["url"])
        w.writeheader()
        w.writerows(results)

    real = [r for r in results if r["label"] == "real"]
    ai = [r for r in results if r["label"] == "ai"]
    fp = sum(r["verdict"] == "likely_ai" for r in real)
    fn = sum(r["verdict"] == "likely_real" for r in ai)
    print("\n## 지표")
    print(f"샘플: ai={len(ai)} real={len(real)}")
    print(f"오탐률 FPR (real→likely_ai): {fp}/{len(real)} = {fp / max(len(real), 1):.2%}")
    print(f"미탐률 FNR (ai→likely_real): {fn}/{len(ai)} = {fn / max(len(ai), 1):.2%}")
    print("verdict 분포:", dict(Counter(r["verdict"] for r in results)))
    overall = [(r["ai_probability"], r["label"] == "ai") for r in results if r["ai_probability"] is not None]
    print(f"전체 AUC: {auc(overall)}")
    for det, pairs in sorted(per_detector.items()):
        print(f"  {det}: n={len(pairs)} AUC={auc(pairs)}")


if __name__ == "__main__":
    main()
