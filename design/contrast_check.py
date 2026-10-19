# 디자인 토큰의 원본 + WCAG 대비 검증 (v2.0 정제·에디토리얼, 사용자 실기기 피드백 반영). 실행: python design/contrast_check.py  → 대비 표 출력(미달 시 assert 실패) + design/tokens.json 재생성.
# 문서: .claude/skills/senior-ux-korean/references/design-system.md. 색을 바꿀 때는 tokens.json을 직접 고치지 말고 이 파일을 고쳐 실행한다.
import json
P = {
 "paper":"#F5F0E6","surface":"#FBF8F2","sunken":"#ECE5D7","line":"#D6CCBA","lineUi":"#857D70","lineStrong":"#665F55",
 "ink":"#1A1814","inkSecondary":"#4A453E","inkTertiary":"#665F55","onInk":"#F5F0E6","inkPressed":"#3A362F",
 "accent":"#1F3A5F","focus":"#1F3A5F","disabledBg":"#E2DACB","disabledFg":"#5C564D",
 "scrim":"rgba(26,24,20,0.55)",
}
V = {
 "likely_ai":  {"main":"#842820","tint":"#F2E0D8","label":"잉크 레드(인주)","icon":{"mci":"alert-outline","glyph":"!","shape":"삼각형+느낌표"}},
 "uncertain":  {"main":"#664610","tint":"#F0E5CB","label":"오커","icon":{"mci":"help-circle-outline","glyph":"?","shape":"원+물음표"}},
 "likely_real":{"main":"#2A5434","tint":"#E1E7D6","label":"딥그린","icon":{"mci":"check-circle-outline","glyph":"✓","shape":"원+체크"}},
 "unknown":    {"main":"#4F4A43","tint":"#E7E2D8","label":"웜 그레이","icon":{"mci":"minus-circle-outline","glyph":"–","shape":"원+가로줄"}},
}
DEV = {"band":"#1F3A5F","bandText":"#F5F0E6","fail":"#842820","failTint":"#F2E0D8","warn":"#664610","ok":"#2A5434",
       "barFill":"#1A1814","barTrack":"#ECE5D7","barExcluded":"#665F55"}
YT = {"ytWhite":"#FFFFFF","ytBlack":"#0F0F0F","ytGray":"#717171"}

def lum(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c: c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def cr(a,b):
    la,lb=sorted([lum(a),lum(b)],reverse=True); return (la+0.05)/(lb+0.05)
ALL = dict(P); ALL.update(YT)
for k,v in V.items(): ALL[k]=v["main"]; ALL[k+".tint"]=v["tint"]
for k,v in DEV.items(): ALL["dev."+k]=v
# (fg, bg, 용도, 기준)  기준: body=7(목표)/4.5(최소), large=4.5(목표)/3, ui=3
pairs = [
 ("ink","paper","본문·헤드라인","body"),("ink","surface","카드·입력칸 안 본문","body"),("ink","sunken","자세히 보기·개발 카드 본문","body"),
 ("inkSecondary","paper","보조 문장","body"),("inkSecondary","surface","카드 안 보조 문장","body"),("inkSecondary","sunken","눌린 영역 보조 문장","body"),
 ("inkTertiary","paper","캡션·placeholder·면책","small"),("inkTertiary","surface","카드 안 캡션","small"),("inkTertiary","sunken","sunken 캡션","small"),
 ("onInk","ink","주 버튼 글자","body"),("onInk","inkPressed","주 버튼 눌림","body"),
 ("accent","paper","링크·텍스트 버튼","body"),("accent","surface","카드 안 링크","body"),
 ("disabledFg","disabledBg","비활성 버튼(면제지만 확보)","body"),
 ("ink","likely_ai.tint","판정 카드 본문(AI)","body"),("ink","uncertain.tint","판정 카드 본문(불확실)","body"),("ink","likely_real.tint","판정 카드 본문(흔적 없음)","body"),("ink","unknown.tint","판정 카드 본문(미확인)","body"),
 ("inkSecondary","likely_ai.tint","판정 카드 퍼센트","body"),("inkSecondary","uncertain.tint","판정 카드 퍼센트","body"),("inkSecondary","likely_real.tint","판정 카드 퍼센트","body"),("inkSecondary","unknown.tint","판정 카드 퍼센트","body"),
 ("likely_ai","likely_ai.tint","판정 헤드라인(26pt Bold)","large"),("uncertain","uncertain.tint","판정 헤드라인","large"),("likely_real","likely_real.tint","판정 헤드라인","large"),("unknown","unknown.tint","판정 헤드라인","large"),
 ("likely_ai","paper","판정 아이콘·스트라이프·인라인 에러 글자","body"),("uncertain","paper","판정 아이콘·스트라이프","body"),("likely_real","paper","판정 아이콘·스트라이프","body"),("unknown","paper","판정 아이콘·스트라이프","body"),
 ("likely_ai","surface","배지 아이콘·배지 글자색(AI)","body"),("uncertain","surface","배지 아이콘(불확실)","body"),("likely_real","surface","배지 아이콘(흔적 없음)","body"),("unknown","surface","배지 아이콘(미확인)","body"),
 ("ink","surface","유튜브 배지 글자","body"),
 ("surface","ytBlack","배지 면 vs 어두운 영상(비텍스트)","ui"),("ink","ytWhite","배지 테두리 vs 흰 유튜브 화면(비텍스트)","ui"),("ink","ytGray","배지 테두리 vs 회색 썸네일(비텍스트)","ui"),
 ("lineUi","paper","입력칸 외곽선·선 버튼 테두리 1px(UI 경계, 비텍스트)","ui"),("lineUi","surface","입력칸 면 위 외곽선(UI 경계)","ui"),("lineUi","sunken","눌린 선 버튼 테두리(UI 경계)","ui"),
 ("ink","surface","입력칸 포커스 테두리 1.5px(비텍스트)","ui"),("likely_ai","surface","입력칸 에러 테두리 1.5px(비텍스트)","ui"),
 ("lineUi","paper","바텀시트 손잡이(비텍스트)","ui"),("focus","paper","키보드 포커스 링 2px(비텍스트)","ui"),
 ("ink","paper","주 버튼 면 vs 종이(비텍스트)","ui"),("likely_ai","paper","판정 윗선 1px·도장 테두리(AI)","ui"),("uncertain","paper","판정 윗선·도장(불확실)","ui"),("likely_real","paper","판정 윗선·도장(흔적 없음)","ui"),("unknown","paper","판정 윗선·도장(미확인)","ui"),
 ("likely_ai","paper","판정 헤드라인(면 없이 종이 위, 26 serif Bold)","large"),("uncertain","paper","판정 헤드라인(종이 위)","large"),("likely_real","paper","판정 헤드라인(종이 위)","large"),("unknown","paper","판정 헤드라인(종이 위)","large"),
 ("lineStrong","paper","(v1 호환) 개발 카드 외곽선","ui"),
 ("line","paper","장식 헤어라인 — 섹션 구분·목록 구분(대비 요구 없음)","deco"),("line","surface","장식 헤어라인(밝은 면 위)","deco"),
 ("dev.bandText","dev.band","DEV 띠 글자","body"),("ink","surface","개발 표 숫자(mono)","body"),
 ("dev.fail","surface","FAIL 사유 글자","body"),("onInk","dev.fail","FAIL 칩 글자","body"),("dev.fail","dev.failTint","실패 행 글자","body"),
 ("dev.ok","surface","OK 칩 글자","body"),("dev.warn","surface","SKIP/조정 글자","body"),
 ("dev.barFill","dev.barTrack","기여도 막대 채움 vs 트랙(비텍스트)","ui"),("dev.barExcluded","dev.barTrack","제외 막대 vs 트랙(비텍스트)","ui"),("dev.barTrack","surface","막대 트랙 vs 카드(장식)","deco"),
]
TH = {"body":(7,4.5),"small":(4.5,4.5),"large":(4.5,3),"ui":(3,3),"deco":(0,0)}
rows=[]; worst={}
for fg,bg,use,k in pairs:
    r=cr(ALL[fg],ALL[bg]); goal,minv=TH[k]
    st = "-" if k=="deco" else ("목표 충족" if r>=goal else ("최소 충족" if r>=minv else "미달"))
    rows.append(f"| `{fg}` {ALL[fg]} | `{bg}` {ALL[bg]} | {use} | {r:.2f}:1 | {st} |")
    if k!="deco": worst.setdefault(k,[]).append((r,fg,bg))
print("\n".join(rows))
for k,v in worst.items(): print(k, "min", min(v))
assert all("미달" not in x for x in rows)

tokens = {
 "meta":{"name":"jjajja ink & cream","version":"2.0.0","mode":"light-only","doc":".claude/skills/senior-ux-korean/references/design-system.md",
         "units":"앱=dp/pt(RN 숫자), 확장=px. 동일 숫자를 그대로 쓴다","generatedBy":"대비 검증 스크립트(문서 §2.4)",
         "v2":"정제·에디토리얼: 보이는 크기를 줄이고 터치 영역은 hitSlop으로 48 이상 보장. 선 1px 기본, 굵기 400/600 중심(문서 §0)",
         "deprecated":{"color.lineStrong":"경계선은 lineUi로. 개발 카드 외곽선(호환)에만 남김","border.ink":"v2에서 1(=hair). 새 코드는 border.hair","border.verdictStripe":"v2 판정 블록은 왼쪽 띠를 쓰지 않음(0)","verdict.*.tint":"v2 판정 블록은 면을 칠하지 않음. 예약값"}},
 "color":P, "verdict":V, "dev":DEV,
 "font":{
  "family":{
   "sans":{"app":{"regular":"Pretendard-Regular","semibold":"Pretendard-SemiBold","bold":"Pretendard-Bold"},
           "web":"\"Pretendard\", system-ui, -apple-system, \"Apple SD Gothic Neo\", \"Malgun Gothic\", \"Noto Sans KR\", sans-serif"},
   "serif":{"app":{"semibold":"NotoSerifKR-SemiBold","bold":"NotoSerifKR-Bold"},
            "web":"\"Noto Serif KR\", \"Nanum Myeongjo\", \"AppleMyungjo\", \"Batang\", serif",
            "rule":"고정 문구 전용(헤드라인·앱 이름). 서버 문자열(evidence_ko 등)에는 절대 쓰지 않는다 — 서브셋 폰트라 없는 글자가 있을 수 있음",
            "semiboldFallback":"NotoSerifKR-SemiBold 서브셋을 아직 번들하지 않았으면 NotoSerifKR-Bold로 그린다(문서 §3.1)"},
   "mono":{"app":{"ios":"Menlo","android":"monospace"},
           "web":"ui-monospace, \"D2Coding\", Menlo, Consolas, monospace"}
  },
  "scale":{
   "display":{"family":"serif","size":28,"lineHeight":38,"weight":"600","letterSpacing":-0.4},
   "headline":{"family":"serif","size":26,"lineHeight":36,"weight":"700","letterSpacing":-0.3},
   "title":{"family":"sans","size":20,"lineHeight":28,"weight":"600","letterSpacing":-0.3},
   "subhead":{"family":"sans","size":18,"lineHeight":28,"weight":"600","letterSpacing":-0.2},
   "button":{"family":"sans","size":17,"lineHeight":24,"weight":"600","letterSpacing":-0.2},
   "body":{"family":"sans","size":18,"lineHeight":29,"weight":"400","letterSpacing":-0.2},
   "bodyStrong":{"family":"sans","size":18,"lineHeight":29,"weight":"600","letterSpacing":-0.2},
   "figure":{"family":"sans","size":17,"lineHeight":24,"weight":"600","numeric":"tabular-nums","letterSpacing":0},
   "caption":{"family":"sans","size":16,"lineHeight":24,"weight":"400","letterSpacing":-0.1},
   "eyebrow":{"family":"sans","size":14,"lineHeight":18,"weight":"600","letterSpacing":2,"transform":"uppercase"}
  },
  "extensionOverride":{"display":{"size":24,"lineHeight":32},"headline":{"size":24,"lineHeight":32},"title":{"size":18,"lineHeight":26},"button":{"size":16,"lineHeight":22}},
  "dev":{
   "mono":{"family":"mono","size":14,"lineHeight":20,"weight":"400","numeric":"tabular-nums"},
   "monoStrong":{"family":"mono","size":14,"lineHeight":20,"weight":"700"},
   "label":{"family":"sans","size":14,"lineHeight":20,"weight":"600"},
   "title":{"family":"sans","size":16,"lineHeight":22,"weight":"600"},
   "band":{"family":"mono","size":13,"lineHeight":18,"weight":"700","letterSpacing":1}
  },
  "maxFontScale":1.6
 },
 "space":{"0":0,"1":4,"2":8,"3":12,"4":16,"5":20,"6":24,"7":32,"8":48,"9":64,
          "screenX":{"app":24,"extension":20},"section":40,"item":12,"buttonGap":12,"blockY":24},
 "radius":{"none":0,"sm":4,"md":6,"button":8,"sheet":16,"round":999},
 "border":{"hair":1,"ink":1,"emphasis":1.5,"strong":2,"focus":2,"verdictLine":1,"verdictStripe":0,"rule":1,"mark":1.5},
 "size":{"buttonMinHeight":48,"buttonSecondaryHeight":44,"textButtonHeight":44,"buttonMinHeightExt":44,"buttonPaddingX":{"primary":24,"secondary":20},
         "buttonMaxWidth":400,"inputMinHeight":56,"touchMin":48,
         "hitSlop":{"primary":0,"secondary":4,"text":4,"icon":8},
         "verdictMark":40,"verdictIcon":24,"badgeHeight":40,"badgeIcon":20,"buttonIcon":20,"bullet":4,
         "rule":{"width":24,"height":1},"topBar":52,"sheetHandle":{"width":36,"height":4},"devBand":28,"devBar":{"width":120,"height":8}},
 "elevation":{"rule":"그림자 금지. 바텀시트는 scrim + 윗모서리 radius 16으로만 층을 표현(윗선 없음)","shadow":None},
 "motion":{"inkBloom":{"durationMs":1600,"easing":"cubic-bezier(0.22,1,0.36,1)","scaleFrom":0.6,"scaleTo":1.5,"opacityFrom":0.6,"opacityTo":0,
                       "dot":16,"ringBorder":1,"reducedMotion":"애니메이션 없이 정지된 잉크 점"},
           "press":{"durationMs":80},"sheet":{"durationMs":240,"easing":"cubic-bezier(0.22,1,0.36,1)"}}
}
json.dump(tokens, open(__import__("os").path.join(__import__("os").path.dirname(__import__("os").path.abspath(__file__)),"tokens.json"),"w"), ensure_ascii=False, indent=2)
