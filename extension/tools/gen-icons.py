"""툴바 아이콘(잉크 스타일) 생성 — design/tokens.json 색만 쓴다.

active  : 잉크(#1A1814) 도장 면 + 크림(#F5F0E6) 돋보기
inactive: 비활성 면(disabledBg) + 외곽선·돋보기 lineStrong — 회색 종이 도장
그림자·그라데이션 없음. 8배로 그려 줄여서 가장자리를 부드럽게 한다.

실행: python extension/tools/gen-icons.py   (Pillow 필요)
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "extension" / "icons"
T = json.loads((ROOT / "design" / "tokens.json").read_text())
C = T["color"]
SS = 8


def hex_rgba(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def draw_icon(size, active):
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = round(S * 0.04)
    radius = round(S * 0.2)
    if active:
        face, edge, mark = hex_rgba(C["ink"]), None, hex_rgba(C["onInk"])
    else:
        face, edge, mark = hex_rgba(C["disabledBg"]), hex_rgba(C["lineStrong"]), hex_rgba(C["lineStrong"])
    edge_w = max(SS, round(S * 0.06)) if edge else 0
    d.rounded_rectangle([pad, pad, S - pad - 1, S - pad - 1], radius=radius, fill=face,
                        outline=edge, width=edge_w)
    # 돋보기: 렌즈 원 + 손잡이
    cx, cy, r = S * 0.44, S * 0.44, S * 0.2
    w = max(SS * 1.5, S * 0.095)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=mark, width=round(w))
    k = 0.7071
    x0, y0 = cx + r * k, cy + r * k
    x1, y1 = S * 0.76, S * 0.76
    hw = round(w * 1.25)
    d.line([x0, y0, x1, y1], fill=mark, width=hw)
    for (x, y) in ((x1, y1),):
        d.ellipse([x - hw / 2, y - hw / 2, x + hw / 2, y + hw / 2], fill=mark)
    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 128):
        for state, active in (("active", True), ("inactive", False)):
            p = OUT / f"{state}-{size}.png"
            draw_icon(size, active).save(p, optimize=True)
            print(p.relative_to(ROOT))


if __name__ == "__main__":
    main()
