# jjajja 디자인 시스템 — 잉크 & 크림 (v2.0 정제·에디토리얼)

앱(Expo RN)과 크롬 확장(HTML/CSS)이 같이 쓰는 기준. 구현자는 이 문서와 `design/tokens.json`만 보고 적용한다.
숫자 토큰의 원본은 `design/contrast_check.py`이다(실행하면 대비 검증 후 `tokens.json`을 다시 만든다). 색이나 크기를 바꾸려면 tokens.json을 직접 고치지 말고 스크립트를 고쳐서 실행한다.
문구는 SKILL.md와 `app/src/ux/copy.ts`가 기준이고, 이 문서는 **보이는 모양**만 정한다. v1.0 문서는 v2 수치로 덮어썼다. v1에서 바뀐 값은 §0.3 표에 모았다.

## 목차
0. v2 변경 사항 — 피드백, 진단, 바뀐 수치, Do/Don't
1. 원칙과 가정
2. 색 — 토큰, 판정 4종, 대비 계산표
3. 글자 — 글꼴, 크기 단계, 숫자
4. 형태 — 선, 모서리, 간격, 터치 영역
5. 부품 — 버튼, 입력칸, 목록·카드, 판정 블록, 배지, 바텀시트, 로딩, 안내 줄
6. 화면별 적용 (실사용자)
7. 개발자 모드
8. 구현 메모 (RN / CSS 대응표)
9. 하지 말 것

---

## 0. v2 변경 사항

### 0.1 피드백과 진단
- 실기기(Expo Go) 피드백 원문: "버튼이 너무 커. 개짜쳐. 레이아웃도 너무 굵어서 싼마이느낌나."
- 원인: v1이 접근성 기준(터치 48dp, 큰 글씨)을 **보이는 크기**로 그대로 옮겼다. 그래서 화면 폭을 다 채운 60pt 버튼이 생겼고, 2px 잉크 테두리와 700 굵기를 여러 곳에 썼다. 판정 블록에는 색 면과 6px 띠를 깔았고, 카드는 1.5px 외곽선으로 빽빽하게 둘렀다. 그 결과 위계가 모두 "굵게"로 몰려서 싸 보였다.
- v2 원칙: **접근성은 터치 영역과 글자 크기로 지키고, 보이는 무게는 줄인다.**
  - 터치 영역은 `hitSlop`으로 48×48 이상을 지킨다. 보이는 버튼 높이와 터치 영역을 분리한다.
  - 본문 18은 그대로 둔다. 50~60대 가독성 기준이라서 크기는 줄이지 않는다. 대신 자간(-0.2), 행간(29), 여백으로 정돈한다.
  - 위계는 굵기로 만들지 않는다. 크기, 여백, 명조/고딕 대비, 색(ink/inkSecondary)으로 만든다.
  - 선은 1px 헤어라인이 기본이다. 구분은 선보다 여백으로 먼저 한다.

### 0.2 가정 (v2에서 새로 정함)
- V1. **주 버튼 하나만 내용 폭(화면 폭 - 좌우 24×2, 최대 400)으로 둔다.** 한 화면에 한 가지 행동이라는 원칙과 맞고, 어르신이 다음 행동을 바로 찾게 해 준다. 높이를 48로 낮추고 글자를 17/600으로 줄이면 내용 폭이어도 무거워 보이지 않는다. 그 밖의 버튼은 모두 글자 폭(선 버튼, 텍스트 버튼)으로 둔다.
- V2. 명조 SemiBold(600) 서브셋 `NotoSerifKR-SemiBold`를 새로 번들하는 것을 권장한다(홈 제목·에러 제목처럼 판정이 아닌 큰 제목에 쓴다). 번들 전에는 `NotoSerifKR-Bold`로 그리되 크기는 v2 값(28)을 쓴다. 굵은 명조 700은 **판정 헤드라인에만** 남긴다.
- V3. 토큰 키는 지우지 않는다(theme.ts 호환). 쓰지 않는 키는 값을 v2에 맞게 바꾸고 `tokens.meta.deprecated`에 적었다: `border.ink`=1, `border.verdictStripe`=0, `color.lineStrong`(개발 카드에만 씀), `verdict.*.tint`(예약값).
- V4. 문구, 판정 구간, 화면 흐름은 바꾸지 않는다. 결과 화면의 [다른 영상 확인하기]만 보조 버튼에서 텍스트 버튼으로 바뀐다(동작은 같다).

### 0.3 바뀐 수치 (v1 → v2)

| 항목 | v1 | v2 |
|------|----|----|
| 주 버튼 보이는 높이 | 60 (확장 52) | **48** (확장 44). 터치 영역 48 |
| 보조 버튼 | 높이 60, 폭 가득, 2px `ink` 테두리 | **선 버튼**: 높이 44, 글자 폭, 1px `lineUi` 테두리, hitSlop 4 → 터치 52 |
| 텍스트 버튼 | 18/600, 높이 48 | 17/600, 보이는 높이 44, hitSlop 4 → 터치 52 |
| 버튼 글자 | 20/28 **700** | **17/24 600**, 자간 -0.2 |
| 버튼 모서리 / 좌우 패딩 | 6 / 16 | **8** / 주 24, 선 20 |
| 버튼 폭 | 모든 주·보조 버튼 화면 폭 가득 | 주 버튼 1개만 내용 폭(최대 400), 나머지는 글자 폭 |
| 기본 선 | 1.5 `lineStrong` (5.55:1) | **1px** `lineUi` #857D70 (3.58:1, UI 경계) / 1px `line` (장식) |
| 2px 선 | 보조 버튼, 배지, 판정 마크, 입력 포커스, 괘선, 시트 윗선 | **유튜브 배지 테두리와 키보드 포커스 링만** |
| 입력칸 | 높이 64, 1.5 `lineStrong`, 포커스 2 `ink` | 높이 56, 1 `lineUi`, 포커스·에러 1.5 |
| 카드 | 면 `surface` + 1.5 외곽선 + 패딩 16 | 외곽선 없음. 목록은 헤어라인과 여백(위아래 16)으로 나눔 |
| 판정 블록 | 색 면 `tint` + 왼쪽 띠 6 + 마크 56(2px) | **면 없음.** 위 1px 판정색 선 + 도장 40(1.5px) + 명조 헤드라인 |
| 괘선(rule) | 32×2 `ink` | 24×1 `ink`, 홈·확인 중·에러 제목 아래에만 |
| 굵기 | 700: display, headline, title, button, eyebrow, 자세히 라벨 | **700은 판정 헤드라인(명조)만.** 나머지는 400/600 |
| display / title / subhead | 30/40 700 / 22/32 700 / 20/30 600 | 28/38 600 / 20/28 600 / 18/28 600 |
| 본문 | 18/28, 자간 0 | 18/**29**, 자간 **-0.2** (크기 유지) |
| eyebrow "JJAJJA" | 15/20 700, 자간 1.5 | 14/18 600, 자간 2 |
| 화면 좌우 여백 | 앱 20 / 확장 16 | 앱 **24** / 확장 **20** |
| 섹션 간격 | 32 | **40** |
| 간격 단계 | …32 · 40 · 56 | …32 · **48 · 64** (`space[8]`=48, `space[9]`=64) |
| 바텀시트 | radius 12 + 윗선 2px `ink` | radius 16, 윗선 없음(scrim만) |
| 배지 | 높이 48, 아이콘 22, 글자 18 | 높이 40, 아이콘 20, 글자 16/600. 테두리 2 `ink`는 유지 |

### 0.4 Do / Don't

| Don't (v1에서 나온 무게) | Do (v2) |
|---|---|
| 버튼을 60pt로 키워 화면 폭 가득 채우기 | 보이는 높이 48(주)·44(선/텍스트), 터치는 hitSlop으로 48 이상 |
| 한 화면에 폭 가득 버튼 2개 이상 쌓기 | 폭 넓은 주 버튼은 1개. 두 번째 행동은 선 버튼이나 텍스트 버튼 |
| 보조 버튼에 2px 검은 테두리 | 1px `lineUi` 선 버튼, 또는 밑줄 텍스트 버튼 |
| 버튼·제목·라벨마다 700 Bold | 600이 최대(UI). 700은 판정 헤드라인 명조 하나 |
| 굵기로 위계 만들기 | 크기·여백·명조/고딕 대비·`inkSecondary`로 위계 |
| 카드마다 외곽선 두르기, 카드 안에 또 칸 나누기 | 외곽선 없이 여백. 필요하면 1px `line` 헤어라인 한 줄 |
| 판정 블록을 색 면 + 굵은 띠로 칠하기 | 종이 위에 얇은 판정색 선 + 작은 도장 + 명조 헤드라인 |
| 본문 글자를 줄여서 정돈된 척하기 | 본문 18 유지, 자간 -0.2·행간 29·좌우 24로 정돈 |
| 장식선을 UI 경계로 쓰기(`line` 1.40:1로 입력칸 테두리) | UI 경계(입력칸, 선 버튼)는 `lineUi` 3:1 이상 |
| 2px 선을 "강조"용으로 쓰기 | 2px는 영상 위 배지와 키보드 포커스 링에만 |
| 화면 끝까지 붙은 빽빽한 배치 | 좌우 24, 섹션 40, 판정 블록 위아래 24 |
| hitSlop을 주고 인접 버튼 사이를 붙이기(터치 영역 겹침) | 버튼 사이 간격 12 이상(hitSlop 4×2보다 크게) |

---

## 1. 원칙과 가정

**톤**: 크림색 종이 위에 검은 잉크로 인쇄한 잡지·신문 지면. 차분하고 믿을 만해야 한다. 장식은 쓰지 않고, **여백과 글자 크기로** 위계를 만든다. 선은 가늘게, 굵기는 아껴 쓴다.

1. **색은 거의 흑백.** 화면 대부분을 크림(paper)과 잉크(ink)로 칠한다. 판정색 4개는 판정 블록의 선·도장·헤드라인, 배지 아이콘, 인라인 에러에만 쓴다.
2. **판정은 색 + 모양 + 문장 세 가지로 전달한다.** 색을 못 구분해도 도장 모양과 헤드라인만으로 뜻이 통해야 한다.
3. **그림자를 쓰지 않는다.** 층은 여백, 헤어라인, 면 색 차이(`sunken`)로 나눈다.
4. **헤드라인은 명조, 나머지는 고딕.** 명조가 지면 느낌을 낸다. 명조 Bold는 판정 헤드라인에만 쓴다.
5. **보이는 크기와 터치 크기를 분리한다.** 접근성은 터치 영역(48 이상)과 본문 크기(18)로 지킨다(§0.1).
6. **실사용자 화면과 개발자 모드는 한눈에 구분된다.** 개발자 모드는 남색 DEV 띠, 고정폭 글꼴, 촘촘한 간격을 쓴다.

**가정** (사용자 결정 #21과 기존 명세에서 정함. v2 가정은 §0.2)
- A1. 라이트 모드만 지원한다. 확장의 `prefers-color-scheme: dark` 블록은 지운다. 다크 모드는 나중에 별도 이슈로 다룬다.
- A2. 문구, 판정 구간, 화면 흐름은 그대로 둔다. 시각 표현만 정한다.
- A3. 아이콘 세트: 앱은 `@expo/vector-icons` MaterialCommunityIcons의 **outline** 계열을 쓴다. 확장은 인라인 SVG를 쓰고, 없으면 글리프(! ? ✓ –)로 대신한다.
- A4. 단위: 앱은 RN 숫자(dp/pt), 확장은 px로 같은 숫자를 쓴다. 확장만 다른 값은 `font.extensionOverride`와 `space.screenX.extension`에 있다.

---

## 2. 색

### 2.1 기본 토큰 (`tokens.color`)

| 토큰 | hex | 용도 |
|------|-----|------|
| `paper` | `#F5F0E6` | 화면 배경(크림 종이), 바텀시트 면 |
| `surface` | `#FBF8F2` | 입력칸, 배지 면, 개발 카드 |
| `sunken` | `#ECE5D7` | 눌린 상태, 자세히 보기 펼친 영역, 막대 트랙 |
| `line` | `#D6CCBA` | **장식 헤어라인 1px**: 섹션 구분, 목록 구분, 상단 바 아래선. 의미나 경계를 싣지 않는다(대비 요구 대상 아님) |
| `lineUi` | `#857D70` | **v2 새 토큰. UI 경계선 1px**: 입력칸 외곽선, 선 버튼 테두리, 시트 손잡이. 비텍스트 3:1 이상 |
| `lineStrong` | `#665F55` | v1 호환. 개발 카드 외곽선에만 쓴다. 실사용자 화면에는 쓰지 않는다 |
| `ink` | `#1A1814` | 본문, 헤드라인, 주 버튼 면, 입력 포커스 테두리 |
| `inkSecondary` | `#4A453E` | 보조 문장, 퍼센트, eyebrow |
| `inkTertiary` | `#665F55` | 캡션, placeholder, 면책 문구(16pt 이상에서만) |
| `onInk` | `#F5F0E6` | 잉크 면 위의 글자 |
| `inkPressed` | `#3A362F` | 주 버튼을 누른 상태 |
| `accent` | `#1F3A5F` | 남색 잉크: 텍스트 버튼, 포커스 링, DEV 띠. **판정 의미 없음** |
| `focus` | `#1F3A5F` | 키보드 포커스 링 2px |
| `disabledBg` / `disabledFg` | `#E2DACB` / `#5C564D` | 비활성 버튼 |
| `scrim` | `rgba(26,24,20,0.55)` | 바텀시트 뒤 덮개 |

강조색은 따로 두지 않는다. 주 행동은 잉크 면 버튼 하나로 강조하고, 남색은 텍스트 버튼과 포커스, 개발자 모드에만 쓴다.

**선 세 종류를 섞지 않는다**
- `line`(1.40:1): 장식. 이 선이 없어도 화면 구조가 여백으로 읽혀야 한다.
- `lineUi`(3.58:1): 사용자가 "여기를 누르거나 입력한다"를 알아야 하는 경계. WCAG 1.4.11 비텍스트 3:1을 지킨다.
- `ink`: 선이 아니라 면(주 버튼)과 상태(입력 포커스 1.5)에 쓴다.

### 2.2 판정 4종 (`tokens.verdict`)

채도를 낮춘 잉크색이다. 인주(도장 인주) 같은 빨강, 황토, 짙은 녹색, 따뜻한 회색.

| verdict | 이름 | `main` | `tint`(v2 예약) | 아이콘(MCI) | 모양 | 확장 글리프 | 헤드라인 (copy.ts) |
|---------|------|--------|--------|-------------|------|-------------|---------------------|
| `likely_ai` | 잉크 레드 | `#842820` | `#F2E0D8` | `alert-outline` | 삼각형 + 느낌표 | `!` | AI로 만든 영상일 가능성이 높아요 |
| `uncertain` | 오커 | `#664610` | `#F0E5CB` | `help-circle-outline` | 원 + 물음표 | `?` | AI로 만들었는지 확실하지 않아요 |
| `likely_real` | 딥그린 | `#2A5434` | `#E1E7D6` | `check-circle-outline` | 원 + 체크 | `✓` | AI로 만든 흔적은 찾지 못했어요 |
| `unknown` | 웜 그레이 | `#4F4A43` | `#E7E2D8` | `minus-circle-outline` | 원 + 가로줄 | `–` | 이 영상은 확인하지 못했어요 |

**색을 쓰는 곳 (v2)**
- `main`: 판정 블록 위 1px 선, 판정 도장(테두리 1.5와 아이콘), 판정 헤드라인 글자, 배지 아이콘.
- `tint`: v2에서는 쓰지 않는다(판정 블록에 면을 칠하지 않는다). 값은 예약해 둔다. 기록 목록의 작은 도장 등에 다시 쓰려면 이 문서를 먼저 고친다.
- 판정 블록 안의 퍼센트와 보조 문장은 `inkSecondary`, `ink`로 쓴다. 판정색으로 쓰지 않는다.
- `likely_ai`의 `main`은 인라인 입력 에러 글자와 에러 테두리에도 쓴다. 다른 판정색은 판정 밖에서 쓰지 않는다.
- 삼각형 아이콘과 각진 도장은 `likely_ai`에만 쓴다. 나머지 셋은 원 도장 안의 기호로 구분한다.
- 접근성 라벨: 도장은 스크린리더에서 숨기고, 헤드라인 문장이 읽히게 한다.

### 2.3 v0 테마 → 토큰 대응 (v1에서 정함, 참고용)

| 기존 `theme.ts` | 토큰 |
|-----------------|---------|
| `background #FFFFFF` | `paper` |
| `surface #F5F6F8` | `surface`(입력칸) / `sunken`(눌림·펼침) |
| `textPrimary` / `textSecondary` | `ink` / `inkSecondary` |
| `border #8A9099` | `lineUi`(경계) / `line`(장식) |
| `primary` / `primaryPressed` / `onPrimary` | 버튼 면 `ink`, 링크 `accent` / `inkPressed` / `onInk` |
| `danger` | `verdict.likely_ai.main` |
| `neutral` | `inkTertiary` |
| `verdictColor[v].main / bg / text` | `verdict[v].main` / (v2: 면 없음) / `verdict[v].main`(헤드라인) |

### 2.4 대비 계산표 (WCAG 2.x 상대휘도 공식, 스크립트로 계산)

공식: `L = 0.2126R + 0.7152G + 0.0722B`(sRGB 선형화 후), `대비 = (L밝은 + 0.05) / (L어두운 + 0.05)`.
기준: 본문은 7:1이 목표, 4.5:1이 최소. 캡션(16pt)은 4.5:1. 큰 글씨(24pt 이상, 또는 18.7pt 이상 굵게)는 4.5:1이 목표, 3:1이 최소. 비텍스트(UI 경계선·아이콘·막대)는 3:1. **장식 헤어라인(`line`, 막대 트랙)은 대비 요구 대상이 아니다(결과 "-").**
다시 계산하려면 `python design/contrast_check.py`를 실행한다. 미달이 있으면 assert로 실패한다. `tint` 행은 v2 예약값 검증용으로 남겨 두었다.

| 글자/전경 | 배경 | 용도 | 대비 | 결과 |
|---|---|---|---|---|
| `ink` #1A1814 | `paper` #F5F0E6 | 본문·헤드라인 | 15.61:1 | 목표 충족 |
| `ink` #1A1814 | `surface` #FBF8F2 | 카드·입력칸 안 본문 | 16.72:1 | 목표 충족 |
| `ink` #1A1814 | `sunken` #ECE5D7 | 자세히 보기·개발 카드 본문 | 14.14:1 | 목표 충족 |
| `inkSecondary` #4A453E | `paper` #F5F0E6 | 보조 문장 | 8.36:1 | 목표 충족 |
| `inkSecondary` #4A453E | `surface` #FBF8F2 | 카드 안 보조 문장 | 8.96:1 | 목표 충족 |
| `inkSecondary` #4A453E | `sunken` #ECE5D7 | 눌린 영역 보조 문장 | 7.57:1 | 목표 충족 |
| `inkTertiary` #665F55 | `paper` #F5F0E6 | 캡션·placeholder·면책 | 5.55:1 | 목표 충족 |
| `inkTertiary` #665F55 | `surface` #FBF8F2 | 카드 안 캡션 | 5.94:1 | 목표 충족 |
| `inkTertiary` #665F55 | `sunken` #ECE5D7 | sunken 캡션 | 5.03:1 | 목표 충족 |
| `onInk` #F5F0E6 | `ink` #1A1814 | 주 버튼 글자 | 15.61:1 | 목표 충족 |
| `onInk` #F5F0E6 | `inkPressed` #3A362F | 주 버튼 눌림 | 10.57:1 | 목표 충족 |
| `accent` #1F3A5F | `paper` #F5F0E6 | 링크·텍스트 버튼 | 10.11:1 | 목표 충족 |
| `accent` #1F3A5F | `surface` #FBF8F2 | 카드 안 링크 | 10.83:1 | 목표 충족 |
| `disabledFg` #5C564D | `disabledBg` #E2DACB | 비활성 버튼(면제지만 확보) | 5.23:1 | 최소 충족 |
| `ink` #1A1814 | `likely_ai.tint` #F2E0D8 | 판정 카드 본문(AI) | 13.87:1 | 목표 충족 |
| `ink` #1A1814 | `uncertain.tint` #F0E5CB | 판정 카드 본문(불확실) | 14.16:1 | 목표 충족 |
| `ink` #1A1814 | `likely_real.tint` #E1E7D6 | 판정 카드 본문(흔적 없음) | 14.01:1 | 목표 충족 |
| `ink` #1A1814 | `unknown.tint` #E7E2D8 | 판정 카드 본문(미확인) | 13.73:1 | 목표 충족 |
| `inkSecondary` #4A453E | `likely_ai.tint` #F2E0D8 | 판정 카드 퍼센트 | 7.43:1 | 목표 충족 |
| `inkSecondary` #4A453E | `uncertain.tint` #F0E5CB | 판정 카드 퍼센트 | 7.58:1 | 목표 충족 |
| `inkSecondary` #4A453E | `likely_real.tint` #E1E7D6 | 판정 카드 퍼센트 | 7.51:1 | 목표 충족 |
| `inkSecondary` #4A453E | `unknown.tint` #E7E2D8 | 판정 카드 퍼센트 | 7.35:1 | 목표 충족 |
| `likely_ai` #842820 | `likely_ai.tint` #F2E0D8 | 판정 헤드라인(26pt Bold) | 7.13:1 | 목표 충족 |
| `uncertain` #664610 | `uncertain.tint` #F0E5CB | 판정 헤드라인 | 6.85:1 | 목표 충족 |
| `likely_real` #2A5434 | `likely_real.tint` #E1E7D6 | 판정 헤드라인 | 6.87:1 | 목표 충족 |
| `unknown` #4F4A43 | `unknown.tint` #E7E2D8 | 판정 헤드라인 | 6.80:1 | 목표 충족 |
| `likely_ai` #842820 | `paper` #F5F0E6 | 판정 아이콘·스트라이프·인라인 에러 글자 | 8.02:1 | 목표 충족 |
| `uncertain` #664610 | `paper` #F5F0E6 | 판정 아이콘·스트라이프 | 7.55:1 | 목표 충족 |
| `likely_real` #2A5434 | `paper` #F5F0E6 | 판정 아이콘·스트라이프 | 7.65:1 | 목표 충족 |
| `unknown` #4F4A43 | `paper` #F5F0E6 | 판정 아이콘·스트라이프 | 7.73:1 | 목표 충족 |
| `likely_ai` #842820 | `surface` #FBF8F2 | 배지 아이콘·배지 글자색(AI) | 8.59:1 | 목표 충족 |
| `uncertain` #664610 | `surface` #FBF8F2 | 배지 아이콘(불확실) | 8.09:1 | 목표 충족 |
| `likely_real` #2A5434 | `surface` #FBF8F2 | 배지 아이콘(흔적 없음) | 8.20:1 | 목표 충족 |
| `unknown` #4F4A43 | `surface` #FBF8F2 | 배지 아이콘(미확인) | 8.28:1 | 목표 충족 |
| `ink` #1A1814 | `surface` #FBF8F2 | 유튜브 배지 글자 | 16.72:1 | 목표 충족 |
| `surface` #FBF8F2 | `ytBlack` #0F0F0F | 배지 면 vs 어두운 영상(비텍스트) | 18.08:1 | 목표 충족 |
| `ink` #1A1814 | `ytWhite` #FFFFFF | 배지 테두리 vs 흰 유튜브 화면(비텍스트) | 17.73:1 | 목표 충족 |
| `ink` #1A1814 | `ytGray` #717171 | 배지 테두리 vs 회색 썸네일(비텍스트) | 3.63:1 | 목표 충족 |
| `lineUi` #857D70 | `paper` #F5F0E6 | 입력칸 외곽선·선 버튼 테두리 1px(UI 경계, 비텍스트) | 3.58:1 | 목표 충족 |
| `lineUi` #857D70 | `surface` #FBF8F2 | 입력칸 면 위 외곽선(UI 경계) | 3.84:1 | 목표 충족 |
| `lineUi` #857D70 | `sunken` #ECE5D7 | 눌린 선 버튼 테두리(UI 경계) | 3.24:1 | 목표 충족 |
| `ink` #1A1814 | `surface` #FBF8F2 | 입력칸 포커스 테두리 1.5px(비텍스트) | 16.72:1 | 목표 충족 |
| `likely_ai` #842820 | `surface` #FBF8F2 | 입력칸 에러 테두리 1.5px(비텍스트) | 8.59:1 | 목표 충족 |
| `lineUi` #857D70 | `paper` #F5F0E6 | 바텀시트 손잡이(비텍스트) | 3.58:1 | 목표 충족 |
| `focus` #1F3A5F | `paper` #F5F0E6 | 키보드 포커스 링 2px(비텍스트) | 10.11:1 | 목표 충족 |
| `ink` #1A1814 | `paper` #F5F0E6 | 주 버튼 면 vs 종이(비텍스트) | 15.61:1 | 목표 충족 |
| `likely_ai` #842820 | `paper` #F5F0E6 | 판정 윗선 1px·도장 테두리(AI) | 8.02:1 | 목표 충족 |
| `uncertain` #664610 | `paper` #F5F0E6 | 판정 윗선·도장(불확실) | 7.55:1 | 목표 충족 |
| `likely_real` #2A5434 | `paper` #F5F0E6 | 판정 윗선·도장(흔적 없음) | 7.65:1 | 목표 충족 |
| `unknown` #4F4A43 | `paper` #F5F0E6 | 판정 윗선·도장(미확인) | 7.73:1 | 목표 충족 |
| `likely_ai` #842820 | `paper` #F5F0E6 | 판정 헤드라인(면 없이 종이 위, 26 serif Bold) | 8.02:1 | 목표 충족 |
| `uncertain` #664610 | `paper` #F5F0E6 | 판정 헤드라인(종이 위) | 7.55:1 | 목표 충족 |
| `likely_real` #2A5434 | `paper` #F5F0E6 | 판정 헤드라인(종이 위) | 7.65:1 | 목표 충족 |
| `unknown` #4F4A43 | `paper` #F5F0E6 | 판정 헤드라인(종이 위) | 7.73:1 | 목표 충족 |
| `lineStrong` #665F55 | `paper` #F5F0E6 | (v1 호환) 개발 카드 외곽선 | 5.55:1 | 목표 충족 |
| `line` #D6CCBA | `paper` #F5F0E6 | 장식 헤어라인 — 섹션 구분·목록 구분(대비 요구 없음) | 1.40:1 | - |
| `line` #D6CCBA | `surface` #FBF8F2 | 장식 헤어라인(밝은 면 위) | 1.50:1 | - |
| `dev.bandText` #F5F0E6 | `dev.band` #1F3A5F | DEV 띠 글자 | 10.11:1 | 목표 충족 |
| `ink` #1A1814 | `surface` #FBF8F2 | 개발 표 숫자(mono) | 16.72:1 | 목표 충족 |
| `dev.fail` #842820 | `surface` #FBF8F2 | FAIL 사유 글자 | 8.59:1 | 목표 충족 |
| `onInk` #F5F0E6 | `dev.fail` #842820 | FAIL 칩 글자 | 8.02:1 | 목표 충족 |
| `dev.fail` #842820 | `dev.failTint` #F2E0D8 | 실패 행 글자 | 7.13:1 | 목표 충족 |
| `dev.ok` #2A5434 | `surface` #FBF8F2 | OK 칩 글자 | 8.20:1 | 목표 충족 |
| `dev.warn` #664610 | `surface` #FBF8F2 | SKIP/조정 글자 | 8.09:1 | 목표 충족 |
| `dev.barFill` #1A1814 | `dev.barTrack` #ECE5D7 | 기여도 막대 채움 vs 트랙(비텍스트) | 14.14:1 | 목표 충족 |
| `dev.barExcluded` #665F55 | `dev.barTrack` #ECE5D7 | 제외 막대 vs 트랙(비텍스트) | 5.03:1 | 목표 충족 |
| `dev.barTrack` #ECE5D7 | `surface` #FBF8F2 | 막대 트랙 vs 카드(장식) | 1.18:1 | - |

**요약 (v2)**
- 가장 낮은 본문 조합: 비활성 버튼 5.23:1(WCAG 면제 대상이지만 AA 확보). 비활성을 빼면 본문 조합은 모두 7.13:1 이상.
- 가장 낮은 캡션 조합: `inkTertiary`/`sunken` 5.03:1(AA). 캡션은 16pt 이상에서만 쓴다.
- 판정 헤드라인은 v2에서 종이 위에 바로 놓인다: 최저 `uncertain`/`paper` 7.55:1(26pt 명조 Bold, 목표 충족).
- 가장 낮은 UI 경계 조합: `lineUi`/`sunken` 3.24:1(선 버튼 눌림). `lineUi`/`paper` 3.58:1, `lineUi`/`surface` 3.84:1. 모두 3:1 이상.
- 배지 테두리 vs 회색 썸네일 3.63:1. 배지는 면 + 2px 잉크 테두리를 함께 써야 어떤 영상 위에서도 3:1 이상이 나온다(2px를 남긴 이유).
- 장식: `line`/`paper` 1.40:1, `line`/`surface` 1.50:1, 막대 트랙 1.18:1. 이 선만으로 경계나 의미를 전달하지 않는다.

---

## 3. 글자

### 3.1 글꼴

| 역할 | 앱 (RN) | 확장 | 라이선스 |
|------|---------|------|----------|
| 본문·UI (sans) | **Pretendard** Regular 400 / SemiBold 600 / Bold 700(번들 유지, 실사용자 화면 v2에서는 거의 안 씀). 키 `Pretendard-Regular`, `Pretendard-SemiBold`, `Pretendard-Bold` | 같은 Pretendard woff2를 `extension/fonts/`에 번들, `@font-face` | SIL OFL 1.1 |
| 큰 제목 (serif 600) | **Noto Serif KR SemiBold**, 키 `NotoSerifKR-SemiBold`. KS X 1001 2,350자 + ASCII 서브셋(약 1MB 목표). **v2 새로 번들 권장**(§0.2 V2). 없으면 Bold로 대신 | 같은 서브셋 woff2 | SIL OFL 1.1 |
| 판정 헤드라인 (serif 700) | **Noto Serif KR Bold**, 키 `NotoSerifKR-Bold`(기존 서브셋) | 같은 서브셋 woff2 | SIL OFL 1.1 |
| 숫자·코드 (mono, 개발자 모드 전용) | iOS `Menlo`, Android `monospace` | `ui-monospace, "D2Coding", Menlo, Consolas, monospace` | 시스템 |

**명조 규칙**
- 명조는 **24pt 이상**, 600 또는 700에서만 쓴다. 본문, 버튼, 캡션, 근거 문장은 모두 Pretendard다.
- 서브셋 폰트라 **고정 문구(copy.ts의 헤드라인·제목·앱 이름)에만** 쓴다. 서버 문자열(`evidence_ko`, 영상 제목 등)에는 절대 쓰지 않는다.
- 폰트 로드 중이거나 실패하면 시스템 글꼴로 대신한다(첫 화면을 막지 않는다). 시스템 폴백에서도 v2 굵기를 따른다: 명조 폴백은 고딕 600(판정 헤드라인만 700).
- 웹폰트는 원격 CDN으로 불러오지 않는다. 반드시 패키지 안에 넣는다.

### 3.2 크기 단계 (`tokens.font.scale`)

| 토큰 | 글꼴 | 크기/행간 | 굵기 | 자간 | 쓰는 곳 |
|------|------|-----------|------|------|---------|
| `display` | serif | 28 / 38 | 600 | -0.4 | 홈 제목, 확인 중 제목 |
| `headline` | serif | 26 / 36 | **700** | -0.3 | **판정 헤드라인.** 에러 제목은 같은 크기를 serif 600으로 쓴다(`headline` + family semibold) |
| `title` | sans | 20 / 28 | 600 | -0.3 | 섹션 제목("이렇게 판단했어요") |
| `subhead` | sans | 18 / 28 | 600 | -0.2 | 자세히 보기 토글, 목록 항목 제목 |
| `button` | sans | 17 / 24 | 600 | -0.2 | 주·선 버튼, 텍스트 버튼 글자 |
| `body` | sans | **18 / 29** | 400 | -0.2 | 본문, 근거 목록, 판정 보조 문장 |
| `bodyStrong` | sans | 18 / 29 | 600 | -0.2 | 본문 안 강조(한 문장 안에서 한 곳만) |
| `figure` | sans | 17 / 24 | 600, tabular-nums | 0 | "AI 가능성 87%" |
| `caption` | sans | 16 / 24 | 400 | -0.1 | 면책, 버튼 아래 안내. **이보다 작게 쓰지 않는다** |
| `eyebrow` | sans | 14 / 18 | 600 | +2, 대문자 | 영문 "JJAJJA"에만. 브랜드 표식이라 16 규칙의 예외. 한글에는 쓰지 않는다 |

- 위계는 **크기 차이 + 여백**으로 만든다. 같은 화면에서 600 글자가 세 군데를 넘으면 하나를 400으로 내린다.
- 판정 블록의 보조 문장은 v1의 `subhead` 20/600에서 v2 `body` 18/400 `ink`로 바뀐다. 헤드라인(명조 700)과의 대비가 커져서 오히려 위계가 또렷해진다.
- 확장 팝업(폭 380px)은 `display` 24/32, `headline` 24/32, `button` 16/22로 줄인다(`extensionOverride`). 본문 18px은 그대로 둔다.
- 시스템 글자 크기 확대는 `maxFontScale 1.6`까지 따른다. 1.6배에서 버튼 글자가 두 줄로 감기면 버튼 높이도 함께 늘어난다(`minHeight`만 지정, 고정 `height` 금지). `numberOfLines` 금지(배지만 예외).

### 3.3 숫자와 잉크 느낌
- 퍼센트는 `figure` 토큰을 쓴다. 고정폭 숫자라서 다시 확인할 때 숫자 폭이 흔들리지 않는다.
- 퍼센트는 헤드라인 **아래에 작게** 둔다. 퍼센트를 크게 강조하는 디자인은 금지다(SKILL.md).
- 잉크 느낌은 명조 헤드라인, 가는 괘선(24×1 `ink`), 작은 판정 도장(§5.4) 세 가지로만 낸다. 질감 이미지, 붓 터치, 손글씨 글꼴은 쓰지 않는다.

---

## 4. 형태

### 4.1 선 (`tokens.border`)

| 토큰 | 값 | 쓰는 곳 |
|------|----|---------|
| `border.hair` | 1 | 기본 선. `line`(장식 구분선), `lineUi`(입력칸, 선 버튼) |
| `border.ink` | 1 | v1 호환 키. `hair`와 같다. 새 코드는 `hair`를 쓴다 |
| `border.emphasis` | 1.5 | 입력칸 포커스(`ink`)와 에러(`likely_ai.main`) |
| `border.mark` | 1.5 | 판정 도장 테두리(`verdict.main`) |
| `border.verdictLine` | 1 | 판정 블록 위 가로선(`verdict.main`, 내용 폭 가득) |
| `border.strong` | 2 | **유튜브 배지 테두리에만**(영상 위 대비 확보) |
| `border.focus` | 2 | 키보드 포커스 링(`focus`, 바깥으로 2 띄움) |
| `border.rule` | 1 | 제목 아래 짧은 괘선(24×1 `ink`) |
| `border.verdictStripe` | 0 | v2에서 쓰지 않음(왼쪽 띠 없음) |

- 한 화면에서 선은 많아야 4줄(상단 바 아래선 포함)로 둔다. 섹션이 여백만으로 구분되면 선을 긋지 않는다.
- 목록 항목 사이는 1px `line` 한 줄. 항목마다 외곽선 상자를 두르지 않는다.

### 4.2 모서리 (`tokens.radius`)

| 토큰 | 값 | 쓰는 곳 |
|------|----|---------|
| `none` | 0 | 판정 블록 선, 막대 |
| `sm` | 4 | 개발 카드, 칩, `likely_ai` 각진 도장 |
| `md` | 6 | 입력칸, 배지, 자세히 보기 펼침 면 |
| `button` | 8 | 주 버튼, 선 버튼 |
| `sheet` | 16 | 바텀시트 윗모서리 |
| `round` | 999 | 원 도장, 로딩 잉크 점 |

- **그림자 금지.** RN `elevation`·`shadow*`, CSS `box-shadow` 없음.

### 4.3 간격 (`tokens.space`)
- 단계: 4 · 8 · 12 · 16 · 20 · 24 · 32 · **48 · 64** (`space[1]`~`space[9]`).
- 화면 좌우 여백: 앱 **24**, 확장 **20**.
- 섹션 사이 **40**(`space.section`), 항목 사이 12(`space.item`), 버튼 사이 12(`space.buttonGap`), 판정 블록 위아래 안쪽 24(`space.blockY`).
- 화면 맨 아래 여백: 48(`space[8]`) + 안전 영역.
- 제목 묶음(제목 → 괘선 → 설명) 안쪽은 12, 묶음과 다음 요소 사이는 32. "가까운 것은 붙이고 다른 것은 띄운다"로 묶음을 보이게 한다.

### 4.4 터치 영역 (보이는 크기와 분리)

| 요소 | 보이는 높이 | `hitSlop` (위·아래·좌·우) | 실제 터치 높이 |
|------|-------------|---------------------------|----------------|
| 주 버튼 | 48 | 0 | 48 |
| 선 버튼 | 44 | 4 | 52 |
| 텍스트 버튼 | 44 (글자 24 + 위아래 10) | 4 | 52 |
| 아이콘 버튼(지우기 ✕, 비밀번호 보기) | 아이콘 22, 상자 40 | 8 | 56 |
| 유튜브 배지 | 40 | 4 | 48 |

- 인접한 두 터치 요소 사이는 12 이상 띄운다(hitSlop 4+4가 겹치지 않게).
- RN `hitSlop`은 부모 영역 밖으로 나가면 동작하지 않을 수 있다. 버튼을 감싼 View에 hitSlop만큼 여백(padding)을 둔다. 웹/확장은 `::before`로 터치 영역을 넓히거나 `min-height`를 48로 둔다(확장은 마우스 위주라 44 허용).

---

## 5. 부품

### 5.1 버튼

| 종류 | 면 | 글자 | 테두리 | 보이는 높이 | 폭 | 눌림 | 비활성 |
|------|----|------|--------|------|----|------|--------|
| 주(primary) | `ink` | `onInk`, `button` 17/600 | 없음 | 48 (확장 44) | **내용 폭, 최대 400, 가운데** (한 화면 1개) | 면 `inkPressed` | 면 `disabledBg`, 글자 `disabledFg` |
| 선(secondary) | 투명 | `ink`, `button` 17/600 | 1 `lineUi` | 44 | **글자 폭** + 좌우 20 | 면 `sunken` | 테두리·글자 `disabledFg` |
| 텍스트(text) | 없음 | `accent`, `button` 17/600, 밑줄 1px(offset 3) | 없음 | 44 | 글자 폭 | 글자 `ink`(색만 바꿈) | — |

- radius 8, 주 버튼 좌우 패딩 24, 선 버튼 20. 고정 `height`가 아니라 `minHeight`.
- 한 화면에 주 버튼은 하나만. 두 번째 행동은 선 버튼, 세 번째부터는 텍스트 버튼.
- 선 버튼과 텍스트 버튼은 기본 가운데 정렬(주 버튼 아래). 목록·설정 화면에서는 왼쪽 정렬.
- 버튼 아래 한 줄 안내(`shareHint` 등): `caption` `inkTertiary`, 가운데, 위 간격 8.
- 아이콘(카카오톡 보내기 등)은 글자 왼쪽에 20, 간격 8, 글자와 같은 색. 카카오 노랑은 쓰지 않는다.
- 텍스트 버튼의 눌림 표시는 v1의 2px 밑줄 대신 글자색을 `ink`로 바꾸는 것으로 한다.

### 5.2 입력칸
- 면 `surface`, 테두리 1 `lineUi`, radius 6, 최소 높이 56, 좌우 패딩 16, 글자 `body` `ink`, placeholder `inkTertiary`.
- 포커스: 테두리 1.5 `ink`. 에러: 테두리 1.5 `likely_ai.main`, 아래 8에 `alert-outline` 18 아이콘 + 에러 문장(`body`, `likely_ai.main`). 테두리 두께가 바뀔 때 글자가 밀리지 않게 안쪽 패딩을 0.5 줄이거나 `outline`으로 그린다.
- 오른쪽 지우기 ✕: 아이콘 22 `inkTertiary`, 상자 40, hitSlop 8.

### 5.3 목록·카드 / 안내 줄
- **카드 외곽선을 쓰지 않는다.** 기록 목록, 계정 정보, 기기 목록은 위아래 패딩 16의 행으로 두고, 행 사이에 1px `line`을 긋는다. 목록 맨 위·아래에는 선을 긋지 않는다.
- 행 안: 제목 `subhead` 18/600 `ink`, 보조 `caption` `inkSecondary`, 오른쪽 chevron 20 `inkTertiary`.
- 꼭 상자가 필요한 경우(확인 대화, 삭제 확인)는 면 `sunken` + radius 6 + 패딩 16으로 만든다. 테두리는 긋지 않는다.
- 안내 줄(note: partial 안내, linkOnly saveHint): 면·테두리·위아래 선 없이, 왼쪽 `information-outline` 18 `inkSecondary` + 오른쪽 `caption` `inkSecondary`, 간격 8.

### 5.4 판정 블록 (결과 화면 맨 위, 시트 결과에서도 같다)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ← 1px verdict.main, 내용 폭 가득 (면 없음, 종이 위)
(24)
 ┌──┐
 │⚠ │   ← 도장 40: 테두리 1.5 main(likely_ai만 각진 radius 4, 나머지 원), 아이콘 24 main
 └──┘
(16)
AI로 만든 영상일 가능성이        ← headline serif 26/36 700, 자간 -0.3, verdict.main
높아요
(8)
AI 가능성 87%                   ← figure 17/600 tabular, inkSecondary
(12)
다른 분께 보내기 전에 한 번 더    ← body 18/29 400, ink
생각해 주세요
(24)
```
- 면(`tint`), 왼쪽 띠, 블록 외곽선은 **쓰지 않는다.** 판정색은 위 가는 선 + 도장 + 헤드라인 세 곳에만 나온다. 이 정도면 색·모양·문장 세 가지 전달(§1-2)을 지키면서 화면이 가벼워진다.
- 블록 좌우 패딩은 0(화면 여백 24를 그대로 쓴다). 위아래 안쪽 24.
- 퍼센트가 null이면 그 줄과 위 간격 8을 지운다. 괘선은 판정 블록에 쓰지 않는다(위 판정색 선이 같은 역할).
- 순서: 위 선 → 도장 → 헤드라인 → 퍼센트 → 보조 문장. "신호등 + 한 문장 + (작게) 숫자"를 따른다.
- 도장을 헤드라인 왼쪽에 나란히 두지 않는다. 1.6배 확대에서 헤드라인이 좁아져 여러 줄로 깨지기 때문이다.

### 5.5 유튜브 배지 (앱 안 유튜브, 영상 위에 떠 있음)

```
╭────────────────────╮   면 surface(불투명), 테두리 2 ink, radius 6, 높이 40, 좌우 패딩 12
│ ▲  AI 가능성 높아요 │   아이콘 20 verdict.main + 글자 16/22 600 ink, 간격 6, 한 줄
╰────────────────────╯
```
- **v2에서 2px 선을 남기는 유일한 실사용자 부품이다.** 어두운 영상 위에서는 크림 면이(18:1), 흰 화면 위에서는 잉크 테두리가(17.7:1), 회색 썸네일 위에서는 테두리가(3.63:1) 경계를 만든다. 반투명 배경이나 블러는 쓰지 않는다.
- 글자는 언제나 `ink`. 판정색은 아이콘에만 쓴다.
- 배지 글자 16은 18 규칙의 예외다(영상 위 짧은 라벨, 한 줄 고정). 자세한 내용은 누르면 열리는 시트에서 18로 보여준다.
- 상태별: 확인 중 = 잉크 점 10 + "확인 중…" / 판정 = 아이콘 + `badgeFor` 라벨 / 미확인·에러 = `minus-circle-outline` + "확인하지 못했어요".
- 눌림: 면 `sunken`. hitSlop 4(터치 48). 화면 가장자리와 유튜브 상단 UI에서 12 이상 띄운다.

### 5.6 바텀시트
- 뒤 덮개 `scrim`. 시트 면 `paper`, 윗모서리 radius 16. **윗선 없음**(v1의 2px `ink` 삭제). 그림자 없음.
- 맨 위 가운데 손잡이 36×4 `lineUi`, radius 2, 위 간격 8.
- 내용 패딩: 좌우 24, 위 16, 아래 안전 영역 + 24. 결과 시트 높이는 기존대로 88%.
- 열기/닫기 240ms, `cubic-bezier(0.22,1,0.36,1)`. reduced-motion이면 페이드만.

### 5.7 로딩 — 잉크 번짐 (애니메이션은 이것 하나뿐)
- 가운데 잉크 점(지름 16, `ink`), 둘레로 같은 크기의 링(테두리 1 `ink`)이 퍼진다. scale 0.6 → 1.5, opacity 0.6 → 0, 1600ms, `cubic-bezier(0.22,1,0.36,1)`, 무한 반복.
- 점은 움직이지 않고 링만 퍼진다(동시에 하나). reduced-motion이면 정지된 점만.
- 스피너(회전 원)는 쓰지 않는다.
- RN: `Animated.loop` + `useNativeDriver: true`. CSS: `@keyframes ink-bloom { from { transform: scale(.6); opacity:.6 } to { transform: scale(1.5); opacity:0 } }`.

---

## 6. 화면별 적용 (실사용자)

공통: 배경 `paper`, 좌우 24, 상태바 dark-content. 상단 바는 높이 52, 왼쪽 `eyebrow` "JJAJJA" `inkSecondary`, 오른쪽 텍스트 버튼(있으면), 아래 1px `line`. 화면 아래 여백 48 + 안전 영역.

### 6.1 홈
```
JJAJJA                              기록  ← eyebrow / 텍스트 버튼
──────────────────────────────── line
(40)
이 영상,                                  ← display serif 28/38 600, ink
AI로 만들었을까?
(12)
──                                        ← rule 24×1 ink
(12)
유튜브 쇼츠 주소를 넣으면 확인해 드려요     ← body 18/29, inkSecondary
(32)
┌───────────────────────────────┐
│ 여기에 영상 주소를 넣어 주세요   ✕ │     ← 입력칸 §5.2 (56, 1px lineUi)
└───────────────────────────────┘
(12)
[■■■■■ 복사한 주소 붙여넣기 ■■■■■]        ← 주 버튼 48, 내용 폭. 입력이 있으면 [확인하기]가 주 버튼
(8)
유튜브에서 '공유 → 링크 복사'를 누른 뒤…   ← caption, inkTertiary, 가운데
(40)
         ( 영상 파일로 확인하기 )           ← 선 버튼 44, 글자 폭, 가운데
(8)
 휴대폰에 저장된 영상을 골라 확인할 수 있어요 ← caption, 가운데
(20)
       유튜브 보면서 확인하기 (시연)        ← 텍스트 버튼 accent, 가운데
```
- 입력이 비면 [붙여넣기]가, 차면 [확인하기]가 주 버튼이 되고, 나머지 하나는 주 버튼 바로 아래(12) 텍스트 버튼으로 내려간다. 폭 넓은 버튼이 두 개가 되지 않게 한다.
- v1의 섹션 구분선(붙여넣기와 영상 파일 사이)은 지우고 여백 40으로 대신한다.

### 6.2 확인 중
```
(화면 세로 가운데)
        ◉  ← 잉크 번짐 §5.7 (점 16)
(32)
   확인하고 있어요…          ← display serif 28/38 600, ink, 가운데
(8)
   보통 10초 정도 걸려요      ← body, inkSecondary
   (12초 지남)               ← caption, inkTertiary
(48)
      ( 그만두기 )            ← 선 버튼 44, 글자 폭
```
- 오래 걸리면(`slow` 문구) 보조 문장만 바꾼다. 경고색 금지.

### 6.3 결과
```
JJAJJA ─────────────────── line
(24)
[판정 블록 §5.4 — 위 1px 판정색 선, 도장 40, 명조 26 700]
(40)
이렇게 판단했어요                    ← title sans 20/28 600, ink
(12)
▪ 유튜브에 'AI로 만든 콘텐츠'…       ← body 18/29 ink, 글머리 4×4 ink 사각점(위 12)
▪ …                                  ← 항목 간격 12
(40)
─────────── line ───────────
자세히 보기                       ⌄   ← subhead 18/600, 높이 52, chevron 20 inkSecondary
─────────── line ───────────
  (펼치면 면 sunken, radius 6, 패딩 16, 위 8)
  화면 속 장면 확인    AI 가능성 63%  ← bodyStrong 18/600 / figure
  참고용 숫자예요…                    ← caption inkTertiary
  유튜브 AI 표시       있음           ← 항목 사이 16, 선 없음
(24)
ⓘ 일부 확인 방법이 작동하지 않아…     ← 안내 줄 §5.3 (partial일 때)
자동으로 확인한 결과라 틀릴 수 있어요  ← caption inkTertiary
(40)
[■■■■ 가족에게 결과 보내기 ■■■■]     ← 주 버튼 48, 내용 폭, 아이콘 20 (unknown이면 없음)
(8)
카카오톡 등으로 보낼 수 있어요         ← caption, 가운데
(20)
       다른 영상 확인하기              ← 텍스트 버튼, 가운데
```
- 보내기 버튼이 없는 경우(unknown)에는 [다른 영상 확인하기]가 주 버튼으로 올라간다.
- 공유 실패 문구는 버튼 바로 아래(8)에 `body`, `likely_ai.main`.
- 자세히 보기의 라벨은 v1의 700에서 `bodyStrong` 600으로 내린다.

### 6.4 에러
```
(위 64)
  ◯–   ← 도장 40, unknown 색(원 1.5 + 가로줄). 에러는 판정이 아니므로 위 판정색 선 없음
(20)
영상 주소가 아닌 것 같아요           ← headline 크기 serif 600(SemiBold 폴백 Bold), ink
(12)
──                                   ← rule 24×1
(12)
유튜브에서 '공유 → 링크 복사'를…     ← body, inkSecondary
(40)
[■■■■ 다시 붙여넣기 ■■■■]            ← 주 버튼 48 (error.*.button)
```
- 에러 화면에는 빨강을 쓰지 않는다. 모든 에러 코드에 같은 회색 도장을 쓴다.

### 6.5 D1 — 주소만으로는 확인이 어려움 (link-only)
- 판정 블록은 `unknown` 색(위 선·도장)으로 그리고, 헤드라인은 `linkOnly.headline`. 퍼센트, 근거, 자세히 보기, 공유는 **모두 숨긴다**.
- 블록 아래(24)에 안내 줄로 `saveHint`.
- 주 버튼 [영상 파일로 확인하기](48, 내용 폭), 아래 20에 텍스트 버튼 [다른 영상 확인하기].

### 6.6 공유하기로 들어온 경우 (결과 다시 보내기)
- 결과 화면과 같다. 주 버튼 글자만 [카카오톡 등으로 다시 보내기], 아래 안내는 "확인 결과와 영상 링크를 함께 보내요". 버튼 왼쪽에 `share-variant-outline` 20 `onInk`.
- 공유로 들어왔다는 표시를 띠나 색으로 따로 만들지 않는다.

### 6.7 기록 · 계정 · 로그인/가입
- 기록 목록: 카드 상자 대신 §5.3 행(위아래 16, 사이 1px `line`). 행 왼쪽에 판정 아이콘 20 `verdict.main`(도장 테두리 없음), 가운데 판정 짧은 문구 `subhead` + 날짜 `caption`, 오른쪽 chevron. "더 보기"는 텍스트 버튼 가운데.
- 삭제 확인 상자: 면 `sunken`, radius 6, 패딩 16, 테두리 없음. 확인은 선 버튼(위험 동작도 빨간 면을 쓰지 않는다), 취소는 텍스트 버튼.
- 계정: 정보 블록은 라벨 `caption inkSecondary` + 값 `body`의 행 목록(카드 테두리 없음). 기기 목록은 행 + 헤어라인. "현재 기기" 표시는 v1의 2px 테두리 칩 대신 `caption` `inkSecondary` 글자 "이 기기"만.
- 로그인/가입: 제목 `display`, 입력칸 사이 16, 입력칸 라벨은 `subhead` 18/600(작은 캡션 라벨로 줄이지 않는다). 제출은 주 버튼 1개, 화면 전환 링크는 텍스트 버튼.

### 6.8 앱 안 유튜브 — 배지와 시트
- 위쪽 바(뒤로 / 쇼츠 처음으로 / 나가기): 면 `paper`, 아래선 1px `line`, 높이 52. 버튼은 아이콘 22 `ink` + 글자 `caption` `ink` 세로 배치, hitSlop 4.
- 배지 §5.5, 시트 §5.6. 시트 안 확인 중 = §6.2 축소(점 16 + `display` + [닫고 계속 보기] 선 버튼). 판정 = §6.3과 같은 판정 블록·근거. 주 버튼은 보내기(있으면), [닫고 계속 보기]는 텍스트 버튼.
- 시트 에러 = §6.4 모양 + [다시 해보기] 주 버튼 + [닫고 계속 보기] 텍스트 버튼.

### 6.9 크롬 확장 팝업 (폭 380px)
```
┌ 380px ─────────────────────────────┐
│ JJAJJA                       설정   │  ← eyebrow / 텍스트 버튼 accent. 높이 48, 아래선 1px line
│────────────────────────────────────│
│ (20)                                │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │  ← 판정 블록 §5.4: 위 선 1px, 도장 36, 헤드라인 24/32
│ (32)                                │
│ 이렇게 판단했어요   (title 18/26 600)│
│ ▪ 근거…            (body 18)        │
│ (20)                                │
│ 이전 결과를 다시 보여드렸어요 (caption)│
│ [■■■■■■ 다시 확인 ■■■■■■] (44)      │  ← 주 버튼, 내용 폭(340)
│ ▸ 자세히 (개발자용)  → §7.4           │
└────────────────────────────────────┘
```
- 좌우 20. 로딩 = 잉크 번짐(점 16) + "확인하고 있어요…"(`display` 24 serif 600) + 안내 + 경과. 에러 = §6.4(도장 36, 제목 24).
- `color-scheme: light` 고정. 결과 헤드라인은 `h1`, 도장 SVG는 `aria-hidden="true"`, `aria-live="polite"` 유지.
- 포커스 링 2px `focus` offset 2.

---

## 7. 개발자 모드

같은 팔레트를 쓰되 실사용자 화면과 **섞이지 않게** 보인다. 대상은 개발자이므로 18pt 규칙을 적용하지 않는다(최소 13). v2 정제는 실사용자 화면 대상이다. 개발자 모드는 밀도가 목적이므로 아래 값만 바꾸고 나머지는 v1과 같다.

### 7.1 구분 장치
- **DEV 띠**: 화면 맨 위(상태바 아래) 높이 28, 면 `dev.band #1F3A5F`, 글자 `dev.bandText` `font.dev.band`(mono 13 Bold, 자간 1)로 `DEV · api {host} · v{contract}`. 개발 모드가 켜져 있으면 **모든 화면**에 띠를 둔다.
- 개발 영역(결과 화면 하단 debug 표)은 위에 2px `dev.band` 선과 `DEV` 칩(면 `dev.band`, 글자 `onInk`, mono 12 Bold, radius 4)으로 시작한다. 실사용자 부분과 40 간격으로 끊는다. (개발 영역의 2px 선은 §0.4의 2px 제한 예외다. 실사용자 화면과 섞이지 않게 하는 구분 장치다.)
- 넓은 남색 면이 보이면 개발자 모드라는 신호다.

### 7.2 글자와 밀도 (`tokens.font.dev`)
| 토큰 | 값 | 용도 |
|------|----|------|
| `dev.title` | sans 16/22 **600** (v1 700) | 카드 제목 |
| `dev.label` | sans 14/20 600 | 라벨 |
| `dev.mono` | mono 14/20 400, tabular | 숫자, id, request_id, 계산식 |
| `dev.monoStrong` | mono 14/20 700 | 최종값 |
| `dev.band` | mono 13/18 700 | DEV 띠 |
- 카드: 면 `surface`, 테두리 1 `lineStrong`, radius 4, 패딩 12, 카드 사이 8. 셀 패딩 4×6.
- 숫자는 오른쪽 정렬과 고정 소수 자리(score 3자리, probability 4자리, `fmtNum`). `selectable`.

### 7.3 기여도 막대
```
id                status  score  weight  기여도
commfor_224       OK      0.631  0.25    ███░░░░░░░░░  0.126
yt_creator_ai…    OK      1.000  1       ████████████  0.800
hive              FAIL    —      0.5     ╱╱╱╱╱╱╱╱╱╱╱╱  timeout 8s   ← 행 왼쪽 띠 3px dev.fail
d3                SKIP    —      0       (제외)
```
- 막대: 트랙 120×8 `dev.barTrack`, radius 0. 채움 `dev.barFill`, 폭은 `weight·score / Σweight`. 오른쪽에 그 몫을 mono 숫자로.
- 확정(decisive) 신호는 채움 끝에 2px `dev.band` 세로 눈금 + 숫자 옆 `◆`.
- 계산에서 빠진 신호(weight 0, 실패)는 `dev.barExcluded` 45° 빗금, 채움 비움. RN에서 빗금이 어려우면 1px `barExcluded` 테두리 빈 트랙.
- 상태 칩(radius 4, mono 12 Bold, 패딩 2×6): `OK` 글자·테두리 1 `dev.ok` / `FAIL` 면 `dev.fail` 글자 `onInk` / `SKIP`·조정 글자·테두리 1 `dev.warn`.
- **실패 강조**: 실패 행 면 `dev.failTint`, 왼쪽 띠 3px `dev.fail`, reason 글자 `dev.fail`. "서버 정책으로 조정됨"은 `dev.warn` 굵게.

### 7.4 크롬 확장의 개발자용 `<details>`
- `summary`: "자세히 (개발자용)" `caption` `inkSecondary`, 앞에 `DEV` 칩. 펼치면 위 2px `dev.band` 선.
- 표: mono 12/16, 셀 테두리 1px `line`, 헤더 면 `sunken`, 헤더 글자 `dev.label`. 기여도 열은 막대 80×6. FAIL 행 규칙은 §7.3과 같다.

---

## 8. 구현 메모

### 8.1 RN (`app/src/ux/theme.ts`, `components/ui.tsx`)
- `tokens.json` 키를 그대로 쓴다. v2 새 키: `color.lineUi`, `radius.button`, `border.emphasis/mark/verdictLine`, `size.buttonSecondaryHeight/textButtonHeight/buttonPaddingX/buttonMaxWidth/hitSlop/buttonIcon/bullet/rule/topBar`, `space.blockY`, `font.family.serif.app.semibold`, `motion.inkBloom.dot/ringBorder`.
- 글꼴: sans 400/600/700 → `Pretendard-Regular/SemiBold/Bold`. serif 600 → `NotoSerifKR-SemiBold`(없으면 `NotoSerifKR-Bold`), serif 700 → `NotoSerifKR-Bold`. 커스텀 폰트에는 `fontWeight`를 함께 주지 않는다(Android 가짜 볼드). `letterSpacing`은 토큰값 그대로.
- 버튼 구현 요지: 주 = `minHeight 48, borderRadius 8, paddingHorizontal 24, width '100%', maxWidth 400`(부모 `alignItems: 'center'`). 선 = `minHeight 44, alignSelf 'center', borderWidth 1, borderColor lineUi, paddingHorizontal 20, hitSlop 4`. 텍스트 = `minHeight 44, hitSlop 4`.
- 판정 블록 요지: `borderTopWidth 1, borderTopColor verdict.main, paddingVertical 24`, 면·왼쪽 띠 없음. 도장 `width/height 40, borderWidth 1.5`.
- `useFonts`가 끝나기 전에는 시스템 글꼴(+v2 굵기)로 그린다. `StatusBar style="dark"`, 루트 `backgroundColor: color.paper`.
- `app/src/ux/tokens.json`은 `npm run tokens`로 다시 복사해야 `__tests__/theme.test.ts`가 통과한다.

### 8.2 CSS 변수 (`extension/popup.css`)
```css
:root {
  color-scheme: light;
  --paper:#F5F0E6; --surface:#FBF8F2; --sunken:#ECE5D7; --line:#D6CCBA; --line-ui:#857D70; --line-strong:#665F55;
  --ink:#1A1814; --ink-2:#4A453E; --ink-3:#665F55; --on-ink:#F5F0E6; --ink-pressed:#3A362F;
  --accent:#1F3A5F; --focus:#1F3A5F; --disabled-bg:#E2DACB; --disabled-fg:#5C564D;
  --v-ai:#842820; --v-unc:#664610; --v-real:#2A5434; --v-unk:#4F4A43;
  --dev-band:#1F3A5F;
  --font-sans:"Pretendard",system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;
  --font-serif:"Noto Serif KR","Nanum Myeongjo","AppleMyungjo","Batang",serif;
  --font-mono:ui-monospace,"D2Coding",Menlo,Consolas,monospace;
  --r-sm:4px; --r-md:6px; --r-btn:8px; --bw:1px; --bw-emph:1.5px; --bw-strong:2px;
  --btn-h:44px; --gutter:20px; --section:40px;
}
```
- 판정 클래스는 `.v-likely_ai / .v-uncertain / .v-likely_real / .v-unknown`처럼 contract enum 그대로. 각 클래스는 `--v-main`만 다시 정의하고, 블록 윗선·도장·헤드라인이 `var(--v-main)`을 쓴다(`--v-*-tint`는 v2에서 제거).
- 본문 `letter-spacing:-0.2px`, 버튼 `font-weight:600`. `font-weight:700`은 `.verdict h1`에만.
- 포커스: `:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }`.

### 8.3 동기화 규칙
- 색이나 크기를 바꿀 때는 `contrast_check.py`를 고치고 실행한 뒤 이 문서의 표를 갱신한다. 그다음 `npm run tokens`(앱 복사본), theme.ts, popup.css를 맞춘다. 한 곳만 고치지 않는다.
- QA는 theme.ts와 popup.css의 hex가 tokens.json과 같은지, `fontWeight 700`/`borderWidth 2`가 §4.1·§3.2에 적힌 곳 밖에 없는지 대조한다.

---

## 9. 하지 말 것
- 그림자, 그라데이션, 글래스모피즘(반투명 블러), 네온·원색(#FF0000, #00C853 등).
- **보이는 버튼을 48보다 크게 키우거나, 폭 넓은 버튼을 한 화면에 두 개 이상 두는 것.** 접근성은 hitSlop으로 지킨다.
- **2px 선을 배지·포커스 링·개발 영역 밖에 쓰는 것. 카드마다 외곽선을 두르는 것.**
- **700 굵기를 판정 헤드라인 밖(실사용자 화면)에 쓰는 것.**
- **본문을 18보다 작게 줄여서 정돈하는 것.** 정돈은 자간·행간·여백으로.
- 장식선 `line`을 입력칸·버튼 경계로 쓰는 것(3:1 미달).
- 판정색으로 면이나 화면 배경을 칠하는 것. 판정색 글자로 본문을 쓰는 것.
- 퍼센트를 헤드라인보다 크게 쓰거나 원형 게이지로 강조하는 것.
- 명조를 24pt 미만이나 서버 문자열에 쓰는 것. 16pt 미만 글자(eyebrow·배지·개발자 모드 제외).
- 스피너, 튀는 애니메이션, 잉크 번짐 외의 반복 애니메이션.
- 에러 화면에 빨강 쓰기. `likely_real`에 "안전", "진짜" 같은 체크 배지 문구를 붙이는 것.
- 개발자 모드 요소(mono, DEV 칩, 남색 면)를 실사용자 화면에 섞는 것.
