"""Noto Serif KR Bold → 확장용 서브셋 woff2 (design-system.md §3.1).

글자 범위: KS X 1001 완성형 한글 2,350자 + ASCII + 자주 쓰는 문장 부호.
헤드라인(고정 문구) 전용이다. 서버 문자열에는 쓰지 않는다 — 없는 글자가 있을 수 있다.

준비: pip install fonttools brotli
원본: https://github.com/notofonts/noto-cjk  Serif/SubsetOTF/KR/NotoSerifKR-Bold.otf (OFL 1.1)
실행: python extension/tools/subset-serif.py <NotoSerifKR-Bold.otf> extension/fonts/NotoSerifKR-Bold.subset.woff2
"""
import sys

from fontTools import subset


def ksx1001_hangul():
    chars = []
    for hi in range(0xB0, 0xC9):
        for lo in range(0xA1, 0xFF):
            try:
                chars.append(bytes([hi, lo]).decode("euc-kr"))
            except UnicodeDecodeError:
                pass
    return chars


def main(src, dst):
    hangul = ksx1001_hangul()
    assert len(hangul) == 2350, len(hangul)
    ascii_ = [chr(c) for c in range(0x20, 0x7F)]
    punct = list("…·‘’“”–—→←‹›「」『』○●△□※～")
    text = "".join(hangul + ascii_ + punct)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.name_languages = ["*"]
    opts.notdef_outline = True
    opts.hinting = False
    font = subset.load_font(src, opts)
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    subset.save_font(font, dst, opts)
    print(f"{dst}: {len(text)} chars")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
