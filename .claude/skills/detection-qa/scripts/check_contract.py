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
    raise SystemExit(1 if missing or extra else 0)


if __name__ == "__main__":
    main()
