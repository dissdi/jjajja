#!/usr/bin/env python3
"""실제 /v1/detect 응답의 키 구조를 계약(detect-api-contract SKILL.md의 첫 200 응답 예시)과 비교한다.

Usage:
  python check_contract.py --url https://youtube.com/shorts/xxx [--endpoint http://localhost:8000/v1/detect]
"""
import argparse
import json
import pathlib
import re
import urllib.request

CONTRACT = pathlib.Path(__file__).resolve().parents[2] / "detect-api-contract" / "SKILL.md"


def contract_example() -> dict:
    text = CONTRACT.read_text(encoding="utf-8")
    blocks = re.findall(r"```json\n(.*?)```", text, re.S)
    for b in blocks:
        if '"ai_probability"' in b:
            return json.loads(b)
    raise SystemExit("계약에서 응답 예시를 찾지 못함")


def keys(obj, prefix=""):
    out = set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            out.add(prefix + k)
            out |= keys(v, prefix + k + ".")
    elif isinstance(obj, list) and obj:
        out |= keys(obj[0], prefix + "[].")
    return out


def types(obj, prefix=""):
    """{경로: {타입명}} — 배열은 모든 원소를 훑는다 (null은 unavailable 신호처럼 뒤쪽 원소에서 나온다)."""
    out = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            out.setdefault(prefix + k, set()).add(type(v).__name__)
            for kk, vv in types(v, prefix + k + ".").items():
                out.setdefault(kk, set()).update(vv)
    elif isinstance(obj, list):
        for it in obj:
            for kk, vv in types(it, prefix + "[].").items():
                out.setdefault(kk, set()).update(vv)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--endpoint", default="http://localhost:8000/v1/detect")
    a = ap.parse_args()
    req = urllib.request.Request(a.endpoint, data=json.dumps({"url": a.url, "source": "paste"}).encode(),
                                 headers={"Content-Type": "application/json"})
    actual = json.load(urllib.request.urlopen(req, timeout=120))
    exp, act = keys(contract_example()), keys(actual)
    missing, extra = sorted(exp - act), sorted(act - exp)
    print("계약에 있으나 응답에 없음:", missing or "없음")
    print("응답에 있으나 계약에 없음:", extra or "없음")
    # 키가 같아도 타입이 다르면 앱 파서가 거부한다 (2026-09-28: signals[].score=null 사례).
    # 계약 예시에 없는 타입(특히 NoneType)이 나오면 경고 — 계약 필드 규칙에 nullable로 적혀 있는지 확인할 것.
    et, at = types(contract_example()), types(actual)
    drift = {k: sorted(at[k] - et[k]) for k in at if k in et and at[k] - et[k] and not ({"int", "float"} >= at[k] | et[k])}
    print("계약 예시와 다른 타입:", drift or "없음")
    raise SystemExit(1 if missing or extra else 0)


if __name__ == "__main__":
    main()
