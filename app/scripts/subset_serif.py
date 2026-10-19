"""Noto Serif KR Bold / SemiBold 서브셋 만들기 (디자인 시스템 §3.1, v2 §0.2 V2).

원본: https://github.com/notofonts/noto-cjk/raw/main/Serif/SubsetOTF/KR/NotoSerifKR-Bold.otf
      https://github.com/notofonts/noto-cjk/raw/main/Serif/SubsetOTF/KR/NotoSerifKR-SemiBold.otf (둘 다 SIL OFL 1.1)
결과: app/assets/fonts/<원본 파일 이름> (NotoSerifKR-Bold.otf = 판정 헤드라인 700, NotoSerifKR-SemiBold.otf = 큰 제목 600)
글자: ASCII + KS X 1001 기호(A1~AC행) + KS X 1001 한글 2,350자 + copy.ts에 쓰인 모든 글자.
헤드라인은 copy.ts 고정 문구에만 쓰므로 copy.ts 글자를 함께 넣어 두부(□)가 나오지 않게 한다.

실행 (fonttools 필요: pip install fonttools):
  python app/scripts/subset_serif.py <원본 NotoSerifKR-Bold.otf 또는 NotoSerifKR-SemiBold.otf>
"""
import pathlib
import subprocess
import sys

APP = pathlib.Path(__file__).resolve().parent.parent


def ksx1001(rows: range) -> str:
    out = []
    for hi in rows:
        for lo in range(0xA1, 0xFF):
            try:
                out.append(bytes([hi, lo]).decode("euc-kr"))
            except UnicodeDecodeError:
                pass
    return "".join(out)


def main() -> None:
    src = sys.argv[1]
    chars = set(chr(c) for c in range(0x20, 0x7F))
    chars |= set(ksx1001(range(0xA1, 0xAD)))  # 기호·전각 문자
    hangul = ksx1001(range(0xB0, 0xC9))
    assert len(hangul) == 2350, len(hangul)
    chars |= set(hangul)
    chars |= set((APP / "src/ux/copy.ts").read_text(encoding="utf-8"))
    chars.discard("\n")
    text_file = APP / ".expo" / "serif-subset-chars.txt"
    text_file.parent.mkdir(parents=True, exist_ok=True)
    text_file.write_text("".join(sorted(chars)), encoding="utf-8")
    name = pathlib.Path(src).name
    assert name in ("NotoSerifKR-Bold.otf", "NotoSerifKR-SemiBold.otf"), name
    out = APP / "assets/fonts" / name
    subprocess.run(
        [
            sys.executable, "-m", "fontTools.subset", src,
            f"--text-file={text_file}",
            f"--output-file={out}",
            "--layout-features=*",
            "--name-IDs=*",
            "--name-languages=*",
            "--notdef-outline",
        ],
        check=True,
    )
    print(f"{out} {out.stat().st_size // 1024} KB, {len(chars)} chars")


if __name__ == "__main__":
    main()
