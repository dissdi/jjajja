#!/usr/bin/env python3
"""라벨된 URL 데이터셋으로 /v1/detect 를 호출해 정확도 지표를 계산한다.

Usage:
  python eval_detect.py --dataset eval/dataset.csv \
      --endpoint http://localhost:8000/v1/detect --out _workspace/04_eval_results.csv \
      [--sleep 3] [--stop-if-unavailable yt_ai_label]

--sleep: 요청 간 최소 간격(초). 플랫폼 봇 차단을 피하려고 둔다(캐시 hit여도 지킨다).
--stop-if-unavailable ID: 응답에서 해당 신호가 unavailable/error면(=플랫폼 조회 차단 징후) 즉시 중단하고
  그때까지의 결과로 지표를 낸다. rate_limited/client_error/5xx 응답도 중단. 재시도는 하지 않는다.
"""
import argparse
import csv
import json
import sys
import time
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
    ap.add_argument("--sleep", type=float, default=0.0, help="요청 간 최소 간격(초)")
    ap.add_argument("--stop-if-unavailable", action="append", default=[], metavar="SIGNAL_ID",
                    help="이 신호가 unavailable/error면 차단 징후로 보고 중단 (여러 번 지정 가능)")
    a = ap.parse_args()

    rows = list(csv.DictReader(open(a.dataset, encoding="utf-8")))
    results = []
    per_detector = defaultdict(list)
    last = 0.0
    stopped = None
    for i, row in enumerate(rows, 1):
        wait = a.sleep - (time.monotonic() - last)
        if wait > 0:
            time.sleep(wait)
        last = time.monotonic()
        res = call(a.endpoint, row["url"], a.timeout)
        is_ai = row["label"].strip() == "ai"
        verdict = res.get("verdict", "error:" + res.get("error", {}).get("code", "?"))
        p = res.get("ai_probability")
        results.append({**row, "verdict": verdict, "ai_probability": p,
                        "partial": res.get("partial"),
                        "cached": res.get("cached"),
                        "top_signals": ";".join(s["id"] for s in res.get("signals", []) if s.get("status") == "ok"),
                        "signals_detail": ";".join(f'{s["id"]}:{s.get("status")}:{s.get("score")}:{s.get("weight")}'
                                                   f'{":D" if s.get("decisive") else ""}'
                                                   for s in res.get("signals", []))})
        for s in res.get("signals", []):
            if s.get("status") == "ok" and s.get("score") is not None:
                per_detector[s["id"]].append((s["score"], is_ai))
        print(f"[{i}/{len(rows)}] {row['label']:>4} → {verdict} ({p})", file=sys.stderr)
        code = res.get("error", {}).get("code", "")
        blocked = [s["id"] for s in res.get("signals", [])
                   if s.get("id") in a.stop_if_unavailable and s.get("status") in ("unavailable", "error")]
        if a.stop_if_unavailable and (blocked or code in ("rate_limited", "client_error") or code.startswith("http_5")):
            stopped = f"{row['url']} ({'unavailable: ' + ','.join(blocked) if blocked else code})"
            print(f"!! 차단/이상 징후로 중단: {stopped}", file=sys.stderr)
            break

    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(results[0].keys()) if results else ["url"])
        w.writeheader()
        w.writerows(results)

    real = [r for r in results if r["label"] == "real"]
    ai = [r for r in results if r["label"] == "ai"]
    fp = sum(r["verdict"] == "likely_ai" for r in real)
    fn = sum(r["verdict"] == "likely_real" for r in ai)
    print("\n## 지표")
    if stopped:
        print(f"(중단됨: {stopped} — {len(results)}/{len(rows)}개 결과만 집계)")
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
