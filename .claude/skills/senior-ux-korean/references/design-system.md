# jjajja 디자인 시스템 — 잉크 & 크림 (v1.0, #21)

앱(Expo RN)과 크롬 확장(HTML/CSS)이 같이 쓰는 기준. 구현자는 이 문서와 `design/tokens.json`만 보고 적용한다.
숫자 토큰의 원본은 `design/contrast_check.py`이다(실행하면 대비 검증 후 `tokens.json`을 다시 만든다). 색을 바꾸려면 tokens.json을 직접 고치지 말고 스크립트를 고쳐서 실행한다.
문구는 SKILL.md와 `app/src/ux/copy.ts`가 기준이고, 이 문서는 **보이는 모양**만 정한다.

## 목차
1. 원칙과 가정
2. 색 — 토큰, 판정 4종, 대비 계산표
3. 글자 — 글꼴, 크기 단계, 숫자
4. 형태 — 선, 모서리, 그림자, 간격
5. 부품 — 버튼, 입력칸, 카드, 판정 블록, 배지, 바텀시트, 로딩, 안내 줄
6. 화면별 적용 (실사용자)
7. 개발자 모드
8. 구현 메모 (RN / CSS 대응표)
9. 하지 말 것

---

## 1. 원칙과 가정

**톤**: 크림색 종이 위에 검은 잉크로 인쇄한 문서. 신문·공문서처럼 차분하고 믿을 만하게 보여야 한다. 장식은 쓰지 않고, 선과 글자 굵기로 위계를 만든다.

1. **색은 거의 흑백.** 화면 대부분을 크림(paper)과 잉크(ink)로 칠한다. 판정색 4개는 판정 블록, 배지, 인라인 에러에만 쓴다.
2. **판정은 색 + 모양 + 문장 세 가지로 전달한다.** 색을 못 구분해도 아이콘 모양과 헤드라인만으로 뜻이 통해야 한다.
3. **그림자를 쓰지 않는다.** 층은 잉크 선과 면 색 차이로 나눈다.
4. **헤드라인은 명조 계열, 나머지는 고딕 계열.** 명조가 "인쇄물" 느낌을 낸다.
5. **실사용자 화면과 개발자 모드는 한눈에 구분된다.** 개발자 모드는 남색 DEV 띠, 고정폭 글꼴, 촘촘한 간격을 쓴다.

**가정** (사용자 결정 #21과 기존 명세에서 정함)
- A1. 라이트 모드만 지원한다(기존 A2 유지). 확장의 `prefers-color-scheme: dark` 블록은 지운다. 크림 종이라는 정체성이 이 앱의 톤이기 때문이다. 다크 모드는 나중에 별도 이슈로 다룬다.
- A2. 문구, 판정 구간, 화면 흐름은 그대로 둔다. 이번 작업은 시각 표현만 바꾼다.
- A3. 아이콘 세트: 앱은 `@expo/vector-icons` MaterialCommunityIcons의 **outline** 계열을 쓴다. 확장은 인라인 SVG를 쓰고, 없으면 글리프(! ? ✓ –)로 대신한다.
- A4. 단위: 앱은 RN 숫자(dp/pt), 확장은 px로 같은 숫자를 쓴다. 확장만 다른 값은 `font.extensionOverride`에 있다.

---

## 2. 색

### 2.1 기본 토큰 (`tokens.color`)

| 토큰 | hex | 용도 |
|------|-----|------|
| `paper` | `#F5F0E6` | 화면 배경(크림 종이) |
| `surface` | `#FBF8F2` | 카드, 입력칸, 배지, 바텀시트 면(밝은 종이) |
| `sunken` | `#ECE5D7` | 눌린 상태, 자세히 보기 펼친 영역, 개발 카드, 막대 트랙 |
| `line` | `#D6CCBA` | 장식용 구분선(hairline). 의미를 싣지 않는다 |
| `lineStrong` | `#665F55` | 입력칸·카드 외곽선(비텍스트 3:1 이상) |
| `ink` | `#1A1814` | 본문, 헤드라인, 주 버튼 면, 보조 버튼 테두리 |
| `inkSecondary` | `#4A453E` | 보조 문장, 퍼센트 |
| `inkTertiary` | `#665F55` | 캡션, placeholder, 면책 문구(16pt 이상에서만) |
| `onInk` | `#F5F0E6` | 잉크 면 위의 글자 |
| `inkPressed` | `#3A362F` | 주 버튼을 누른 상태 |
| `accent` | `#1F3A5F` | 남색 잉크: 링크, 텍스트 버튼, 포커스 링, DEV 띠. **판정 의미 없음** |
| `focus` | `#1F3A5F` | 키보드 포커스 링 3px |
| `disabledBg` / `disabledFg` | `#E2DACB` / `#5C564D` | 비활성 버튼 |
| `scrim` | `rgba(26,24,20,0.55)` | 바텀시트 뒤 덮개 |

강조색은 따로 두지 않는다. 주 행동은 잉크 면 버튼 하나로 강조하고, 남색은 링크와 포커스, 개발자 모드에만 쓴다.

### 2.2 판정 4종 (`tokens.verdict`)

채도를 낮춘 잉크색이다. 인주(도장 인주) 같은 빨강, 황토, 짙은 녹색, 따뜻한 회색.

| verdict | 이름 | `main` | `tint` | 아이콘(MCI) | 모양 | 확장 글리프 | 헤드라인 (copy.ts) |
|---------|------|--------|--------|-------------|------|-------------|---------------------|
| `likely_ai` | 잉크 레드 | `#842820` | `#F2E0D8` | `alert-outline` | 삼각형 + 느낌표 | `!` | AI로 만든 영상일 가능성이 높아요 |
| `uncertain` | 오커 | `#664610` | `#F0E5CB` | `help-circle-outline` | 원 + 물음표 | `?` | AI로 만들었는지 확실하지 않아요 |
| `likely_real` | 딥그린 | `#2A5434` | `#E1E7D6` | `check-circle-outline` | 원 + 체크 | `✓` | AI로 만든 흔적은 찾지 못했어요 |
| `unknown` | 웜 그레이 | `#4F4A43` | `#E7E2D8` | `minus-circle-outline` | 원 + 가로줄 | `–` | 이 영상은 확인하지 못했어요 |

**색을 쓰는 곳**
- `main`: 판정 마크(아이콘과 도장 테두리), 판정 블록 왼쪽 띠 6px, 판정 헤드라인 글자, 배지 아이콘.
- `tint`: 판정 블록 면 하나에만 쓴다. 화면 배경 전체를 tint로 칠하지 않는다.
- 판정 블록 안의 본문과 퍼센트는 `ink`, `inkSecondary`로 쓴다. 판정색으로 쓰지 않는다.
- `likely_ai`의 `main`은 인라인 입력 에러 글자에도 쓴다(기존 `danger` 대체). 다른 판정색은 판정 밖에서 쓰지 않는다.
- 삼각형은 `likely_ai`에만 쓴다. 나머지 셋은 원 안의 기호로 구분한다. 색각 이상 사용자도 모양만으로 "경고"와 "그 외"를 가를 수 있다.
- 접근성 라벨: 마크는 스크린리더에서 숨기고, 헤드라인 문장이 읽히게 한다(기존 구현 유지).

### 2.3 기존 토큰 → 새 토큰 대응

| 기존 `theme.ts` | 새 토큰 |
|-----------------|---------|
| `background #FFFFFF` | `paper` |
| `surface #F5F6F8` | `surface`(카드) / `sunken`(눌림·펼침) |
| `textPrimary` | `ink` |
| `textSecondary` | `inkSecondary` |
| `border #8A9099` | `lineStrong`(외곽선) / `line`(구분선) |
| `primary #1D4ED8` | 버튼 면은 `ink`, 링크는 `accent` |
| `primaryPressed` | `inkPressed` |
| `onPrimary` | `onInk` |
| `danger` | `verdict.likely_ai.main` |
| `neutral` | `inkTertiary` |
| `verdictColor[v].main / bg / text` | `verdict[v].main` / `verdict[v].tint` / `verdict[v].main`(헤드라인) |
| `verdictIcon` | `verdict[v].icon.mci`(outline으로 바뀜) |

확장 CSS `--red/--yellow/--green/--gray/--primary`는 §8의 변수 이름으로 바꾼다.

### 2.4 대비 계산표 (WCAG 2.x 상대휘도 공식, 스크립트로 계산)

공식: `L = 0.2126R + 0.7152G + 0.0722B`(sRGB 선형화 후), `대비 = (L밝은 + 0.05) / (L어두운 + 0.05)`.
기준: 본문은 7:1이 목표, 4.5:1이 최소. 캡션(16pt)은 4.5:1. 큰 글씨(24pt 이상, 또는 18.7pt 이상 굵게)는 4.5:1이 목표, 3:1이 최소. 비텍스트(테두리·아이콘·막대)는 3:1.
다시 계산하려면 `python design/contrast_check.py`를 실행한다. 미달이 있으면 assert로 실패한다.

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
| `lineStrong` #665F55 | `paper` #F5F0E6 | 입력칸·카드 외곽선(비텍스트) | 5.55:1 | 목표 충족 |
| `ink` #1A1814 | `paper` #F5F0E6 | 보조 버튼 테두리(비텍스트) | 15.61:1 | 목표 충족 |
| `focus` #1F3A5F | `paper` #F5F0E6 | 포커스 링(비텍스트) | 10.11:1 | 목표 충족 |
| `line` #D6CCBA | `paper` #F5F0E6 | 장식용 구분선(대비 요구 없음) | 1.40:1 | - |
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

**요약**
- 가장 낮은 본문 조합: 비활성 버튼 5.23:1. WCAG에서 비활성 요소는 대비 요구가 면제되지만 AA를 넘게 잡았다. 비활성을 빼면 본문 조합은 모두 7.13:1 이상이다.
- 가장 낮은 캡션 조합: `inkTertiary`/`sunken` 5.03:1(AA). 캡션은 16pt 이상에서만 쓴다.
- 가장 낮은 큰 글씨 조합: 판정 헤드라인 `unknown`/tint 6.80:1.
- 가장 낮은 비텍스트 조합: 배지 테두리와 회색 썸네일 3.63:1. 어두운 영상 위에서는 배지 면이 18:1로 보인다. **배지는 면 + 잉크 테두리를 함께 써야** 어떤 배경에서도 3:1 이상이 나온다.
- `line`(1.40:1)과 막대 트랙(1.18:1)은 장식이다. 이 선만으로 경계나 의미를 전달하지 않는다. 입력칸이나 버튼처럼 경계가 중요한 곳에는 `lineStrong` 또는 `ink`를 쓴다.

---

## 3. 글자

### 3.1 글꼴

| 역할 | 앱 (RN) | 확장 | 라이선스 |
|------|---------|------|----------|
| 본문·UI (sans) | **Pretendard** Regular 400 / SemiBold 600 / Bold 700을 `expo-font`로 번들. 키 `Pretendard-Regular`, `Pretendard-SemiBold`, `Pretendard-Bold` | 같은 Pretendard woff2(Regular, SemiBold, Bold)를 `extension/fonts/`에 번들하고 `@font-face`로 불러온다 | SIL OFL 1.1. 상업 앱 번들·재배포 가능 |
| 헤드라인 (serif) | **Noto Serif KR Bold 700** 하나만. 키 `NotoSerifKR-Bold`. KS X 1001 한글 2,350자 + ASCII로 **서브셋**해서 용량을 줄인다(전체 약 6MB → 약 1MB 목표) | 같은 서브셋 woff2 | SIL OFL 1.1 |
| 숫자·코드 (mono, 개발자 모드 전용) | iOS `Menlo`, Android `monospace` (번들 없음) | `ui-monospace, "D2Coding", Menlo, Consolas, monospace` | 시스템 |

**명조를 헤드라인에 쓰는 이유와 한계**
- 굵은 명조는 "인쇄된 판정문" 느낌을 주고, 고딕 본문과 위계가 분명하게 갈린다.
- 명조는 획이 가늘어 작은 크기에서 어르신에게 읽기 어렵다. 그래서 **24pt 이상, Bold에서만** 쓴다. 본문, 버튼, 캡션, 근거 문장은 모두 Pretendard로 쓴다.
- 서브셋 폰트라 **고정 문구(copy.ts의 헤드라인·타이틀·앱 이름)에만** 쓴다. 서버 문자열(`evidence_ko`, 영상 제목 등)에는 절대 쓰지 않는다. 서브셋에 없는 글자는 두부(□)로 나온다.
- 폰트 로드에 실패하거나 로드 중이면 시스템 글꼴로 대신한다. 로딩 때문에 첫 화면을 막지 않는다.
- 웹폰트는 원격 CDN으로 불러오지 않는다. 확장 CSP와 오프라인 동작 때문이다. 반드시 패키지 안에 넣는다.

### 3.2 크기 단계 (`tokens.font.scale`)

| 토큰 | 글꼴 | 크기/행간 | 굵기 | 쓰는 곳 |
|------|------|-----------|------|---------|
| `display` | serif | 30 / 40 | 700 | 홈 제목, 확인 중 제목 |
| `headline` | serif | 26 / 36 | 700 | 판정 헤드라인, 에러 제목 |
| `title` | sans | 22 / 32 | 700 | 섹션 제목("이렇게 판단했어요") |
| `subhead` | sans | 20 / 30 | 600 | 판정 보조 문장, 자세히 보기 토글 |
| `button` | sans | 20 / 28 | 700 | 버튼 글자 |
| `body` | sans | 18 / 28 | 400 | 본문, 근거 목록 |
| `bodyStrong` | sans | 18 / 28 | 600 | 본문 강조, 배지 글자 |
| `figure` | sans | 18 / 28 | 600, tabular-nums | "AI 가능성 87%" |
| `caption` | sans | 16 / 24 | 400 | 면책, 버튼 아래 한 줄 안내. **이보다 작게 쓰지 않는다** |
| `eyebrow` | sans | 15 / 20 | 700, 자간 1.5 | 영문 대문자 라벨 "JJAJJA"에만 쓴다. 한글에는 쓰지 않는다 |

- 확장 팝업(폭 380px)은 `display` 26/34, `headline` 24/32, `button` 18/26으로 줄인다(`extensionOverride`). 본문 18px은 그대로 둔다.
- 시스템 글자 크기 확대는 `maxFontScale 1.6`까지 따른다. 1.6배에서도 버튼 글자가 두 줄로 감기되 잘리지 않게 한다(`numberOfLines` 금지, 배지만 예외).
- 자간: serif 헤드라인은 -0.2~-0.3으로 살짝 조인다. 본문은 0이다.

### 3.3 숫자와 잉크 느낌
- 퍼센트는 `figure` 토큰을 쓴다. 고정폭 숫자(RN `fontVariant: ['tabular-nums']`, CSS `font-variant-numeric: tabular-nums`)라서 다시 확인할 때 숫자 폭이 흔들리지 않는다.
- 퍼센트는 헤드라인 **아래에 작게** 둔다. 퍼센트를 크게 강조하는 디자인은 금지다(SKILL.md: 숫자만으로 판단하게 만들지 않는다).
- 잉크 느낌은 굵은 명조 헤드라인, 헤드라인 아래 잉크 괘선(`border.rule` 2px, 폭 32, `ink`), 도장 같은 판정 마크(§5.4) 세 가지로만 낸다. 질감 이미지, 붓 터치, 손글씨 글꼴은 쓰지 않는다.

---

## 4. 형태

| 토큰 | 값 | 쓰는 곳 |
|------|----|---------|
| `border.hair` | 1 | `line` 구분선 |
| `border.ink` | 1.5 | 카드·입력칸 외곽선(`lineStrong`) |
| `border.strong` | 2 | 보조 버튼, 배지, 판정 마크, 입력칸 포커스(`ink`) |
| `border.focus` | 3 | 키보드 포커스 링(`focus`, 바깥으로 2px 띄움) |
| `border.verdictStripe` | 6 | 판정 블록 왼쪽 띠 |
| `border.rule` | 2 | 헤드라인 아래 짧은 괘선, 바텀시트 윗선 |
| `radius.none` | 0 | 판정 블록(왼쪽 띠와 면이 직각으로 맞물리게) |
| `radius.sm` | 4 | 카드, 입력칸, 개발 카드, 칩 |
| `radius.md` | 6 | 버튼, 배지 |
| `radius.sheet` | 12 | 바텀시트 윗모서리 |
| `radius.round` | 999 | 판정 마크 원, 로딩 잉크 점 |

- **그림자 금지.** RN `elevation`이나 `shadow*`, CSS `box-shadow`를 쓰지 않는다. 바텀시트는 `scrim`과 윗선 2px `ink`로 층을 표현한다.
- 모서리를 둥글게 많이 깎지 않는다(최대 6, 시트만 12). 각진 모양이 인쇄물처럼 단정해 보인다.
- 간격(`tokens.space`): 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56. 화면 좌우 여백은 앱 20, 확장 16. 섹션 사이 32, 항목 사이 12, 버튼 사이 12.
- 구분선은 섹션 사이에만 1px `line`을 쓴다. 목록 항목 사이에는 선을 긋지 않고 간격으로 나눈다.

---

## 5. 부품

### 5.1 버튼 (터치 영역 최소 48×48, 주요 버튼은 폭 가득)

| 종류 | 면 | 글자 | 테두리 | 높이 | 눌림 | 비활성 |
|------|----|------|--------|------|------|--------|
| 주(primary) | `ink` | `onInk`, `button` | 없음 | 60 (확장 52) | 면 `inkPressed` | 면 `disabledBg`, 글자 `disabledFg` |
| 보조(secondary) | 투명 | `ink`, `button` | 2 `ink` | 60 (확장 52) | 면 `sunken` | 테두리·글자 `disabledFg` |
| 텍스트(text) | 없음 | `accent`, `bodyStrong`, 밑줄 1px(offset 3) | 없음 | 48 | 밑줄 2px | — |

- 한 화면에 주 버튼은 하나만 둔다. 나머지는 보조나 텍스트 버튼으로 둔다.
- 버튼 아래 한 줄 안내(`shareHint` 등)는 `caption`, `inkTertiary`, 가운데 정렬, 위 간격 6.
- 아이콘을 넣는 경우(예: 카카오톡 보내기)는 글자 왼쪽에 22 크기로 둔다. 색은 글자와 같게 하고, 카카오 노랑은 쓰지 않는다.

### 5.2 입력칸
- 면 `surface`, 테두리 1.5 `lineStrong`, radius 4, 최소 높이 64, 좌우 패딩 16, 글자 `body` `ink`, placeholder `inkTertiary`.
- 포커스되면 테두리를 2 `ink`로 바꾼다. 에러가 나면 테두리를 2 `likely_ai.main`으로 바꾸고, 아래에 `alert-outline` 20 아이콘과 에러 문장(`body`, `likely_ai.main`)을 둔다.

### 5.3 카드 / 안내 줄
- 카드: 면 `surface`, 테두리 1.5 `lineStrong`, radius 4, 패딩 16. 그림자는 없다.
- 안내 줄(note: partial 안내, linkOnly saveHint): 면과 테두리 없이 왼쪽에 `information-outline` 20 `inkSecondary` 아이콘, 오른쪽에 `caption` `inkSecondary`. 위아래로 1px `line` 구분선만 긋는다.

### 5.4 판정 블록 (결과 화면 맨 위, 시트 결과에서도 같다)

```
┃▌                                          ┃   ← 왼쪽 띠 6px verdict.main, 면 verdict.tint, radius 0
┃▌  ◯!   (판정 마크 56: 원 테두리 2px main,   ┃     안에 MCI outline 아이콘 32 main)
┃▌                                          ┃
┃▌  AI로 만든 영상일 가능성이 높아요          ┃   ← headline serif 26/36 Bold, verdict.main
┃▌  ──                                       ┃   ← 괘선 32×2 ink (rule)
┃▌  AI 가능성 87%                            ┃   ← figure 18 SemiBold tabular, inkSecondary
┃▌  다른 분께 보내기 전에 한 번 더             ┃   ← subhead 20/30 SemiBold, ink
┃▌  생각해 주세요                             ┃
```
- 패딩: 위 20, 아래 20, 왼쪽 20(띠 다음부터), 오른쪽 20. 마크와 헤드라인 사이 12. 헤드라인, 괘선, 퍼센트, 보조 문장 사이는 각각 8.
- 판정 마크는 "도장"이다. 원 테두리 2px 안에 아이콘을 둔다. `likely_ai`만 원 대신 **각진 정사각 도장**(radius 4, 테두리 2)을 쓰고 안에 `alert-outline`을 둔다. 모양 차이가 하나 더 생긴다.
- 퍼센트가 null이면 그 줄은 없다(괘선은 남긴다).
- 순서: 마크 → 헤드라인 → 괘선 → 퍼센트 → 보조 문장. SKILL.md의 "신호등 + 한 문장 + (작게) 숫자"를 따른다.

### 5.5 유튜브 배지 (앱 안 유튜브, 영상 위에 떠 있음)

```
╭──────────────────────╮   면 surface(불투명), 테두리 2 ink, radius 6, 높이 48, 좌우 패딩 14
│ ▲  AI 가능성 높아요   │   아이콘 22 verdict.main + 글자 bodyStrong 18 ink, 간격 8, 한 줄
╰──────────────────────╯
```
- **면은 반드시 불투명 `surface`로, 테두리는 2 `ink`로 둔다.** 어두운 영상 위에서는 크림 면이(18:1), 흰 유튜브 화면 위에서는 잉크 테두리가(17.7:1) 보인다. 반투명 배경이나 블러는 쓰지 않는다.
- 글자는 언제나 `ink`로 쓴다. 판정색은 아이콘에만 쓴다. 배지가 작아서 판정색 글자는 영상 위에서 흐려 보이기 때문이다.
- 상태별 모양:
  - 확인 중: 왼쪽에 잉크 점 12(§5.7을 축소한 애니메이션) + "확인 중…"
  - 판정: 아이콘(§2.2) + 짧은 라벨(`badgeFor`가 주는 문구)
  - 미확인·에러: `minus-circle-outline` + "확인하지 못했어요"
- 눌렀을 때: 면 `sunken`. 길게 끌어 옮기는 동작은 기존대로 둔다. 그림자 대신 테두리로 떠 있음을 보여준다.
- 배지 바깥 여백: 화면 가장자리와 유튜브 상단 UI에서 12 이상 띄운다.

### 5.6 바텀시트 (앱 안 유튜브 결과 등)
- 뒤 덮개는 `scrim`. 시트 면은 `paper`, 윗모서리 radius 12, **윗선 2px `ink`**. 그림자는 없다.
- 맨 위 가운데에 손잡이 40×4 `lineStrong`, radius 2, 위 간격 8을 둔다.
- 내용 패딩은 좌우 20, 위 16, 아래는 안전 영역 + 20. 결과 시트 높이는 기존대로 88%.
- 열기/닫기는 240ms, `cubic-bezier(0.22,1,0.36,1)`로 미끄러진다. reduced-motion이면 페이드만 쓴다.

### 5.7 로딩 — 잉크 번짐 (애니메이션은 이것 하나뿐)
- 가운데에 잉크 점(지름 20, `ink`)을 두고, 그 둘레로 같은 크기의 링(테두리 2 `ink`)이 퍼진다. scale 0.6 → 1.5, opacity 0.85 → 0, 1600ms, `cubic-bezier(0.22,1,0.36,1)`, 무한 반복. 종이에 잉크가 스며 번지는 느낌이다.
- 점 자체는 움직이지 않는다. 링만 퍼진다(동시에 하나).
- `prefers-reduced-motion` / RN `AccessibilityInfo.isReduceMotionEnabled()`이면 정지된 점만 둔다. 문구와 경과 시간이 진행 상황을 알린다.
- 스피너(회전 원)는 쓰지 않는다.
- RN: `Animated.loop` + `useNativeDriver: true`(transform, opacity). CSS: `@keyframes ink-bloom { from { transform: scale(.6); opacity:.85 } to { transform: scale(1.5); opacity:0 } }`.

---

## 6. 화면별 적용 (실사용자)

공통: 배경 `paper`, 좌우 20, 상태바는 dark-content. 맨 위 줄(앱 이름)은 `eyebrow` "JJAJJA" `inkSecondary`로 쓰고, 아래에 1px `line` 구분선을 둔다.

### 6.1 홈
```
JJAJJA                                   ← eyebrow, inkSecondary
───────────────────────────────── line
(32)
이 영상,                                  ← display serif 30/40, ink
AI로 만들었을까?
──                                        ← rule 32×2 ink
유튜브 쇼츠 주소를 넣으면 확인해 드려요     ← body, inkSecondary
(24)
┌───────────────────────────────┐
│ 여기에 영상 주소를 넣어 주세요   ✕ │     ← 입력칸 §5.2
└───────────────────────────────┘
(12)
[■■■■ 복사한 주소 붙여넣기 ■■■■]           ← 주 버튼(입력이 비었을 때). 입력이 있으면 [확인하기]가 주 버튼
유튜브에서 '공유 → 링크 복사'를 누른 뒤…   ← caption, inkTertiary, 가운데
(32) ─────────── line ───────────
[ 영상 파일로 확인하기 ]                   ← 보조 버튼
휴대폰에 저장된 영상을 골라 확인할 수 있어요 ← caption
(12)
유튜브 보면서 확인하기 (시연)  ›           ← 텍스트 버튼 accent
```
- 주 버튼은 한 번에 하나다. 입력칸이 비면 [붙여넣기]가, 차면 [확인하기]가 주 버튼이 되고 다른 하나는 보조 버튼으로 바뀐다.

### 6.2 확인 중
```
(화면 세로 가운데)
        ◉  ← 잉크 번짐 §5.7
(24)
   확인하고 있어요…          ← display serif 30, ink, 가운데
   보통 10초 정도 걸려요      ← body, inkSecondary
   (12초 지남)               ← caption, inkTertiary (기존 경과 표시)
(40)
   [ 그만두기 ]              ← 보조 버튼
```
- 오래 걸리면(`slow` 문구) 보조 문장만 바꾼다. 색은 그대로 둔다(경고색 금지).

### 6.3 결과
```
JJAJJA ─────────────────── line
(20)
[판정 블록 §5.4]
(32)
이렇게 판단했어요                    ← title sans 22 Bold, ink
• 유튜브에 'AI로 만든 콘텐츠'…       ← body ink, 글머리는 ink 사각점 6×6(•보다 인쇄물 느낌)
• …                                  ← 항목 간격 12
(24)
─────────── line ───────────
자세히 보기                       ⌄   ← subhead, 높이 56, 오른쪽 chevron 24 ink
─────────── line ───────────
  (펼치면 면 sunken, 패딩 16)
  화면 속 장면 확인    AI 가능성 63%  ← body 700 / figure
  참고용 숫자예요…                    ← caption inkTertiary
  유튜브 AI 표시       있음
(20)
ⓘ 일부 확인 방법이 작동하지 않아…     ← 안내 줄 §5.3 (partial일 때)
자동으로 확인한 결과라 틀릴 수 있어요  ← caption inkTertiary
(32)
[■■■ 가족에게 결과 보내기 ■■■]        ← 주 버튼(unknown이면 없음)
카카오톡 등으로 보낼 수 있어요         ← caption
(12)
[ 다른 영상 확인하기 ]                 ← 보조 버튼
```
- 보내기 버튼이 없는 경우(unknown)에는 [다른 영상 확인하기]가 주 버튼으로 올라간다.
- 공유 실패 문구는 버튼 바로 아래에 `body`, `likely_ai.main`으로 둔다.

### 6.4 에러
```
(위 56)
  ◯–   ← 판정 마크 56, unknown 색(원 + 가로줄). 에러는 판정이 아니므로 블록 면/띠 없음
(16)
영상 주소가 아닌 것 같아요           ← headline serif 26, ink (판정색 아님)
──
유튜브에서 '공유 → 링크 복사'를…     ← body, inkSecondary
(32)
[■■■ 다시 붙여넣기 ■■■]              ← 주 버튼 (error.*.button)
```
- 에러 화면에는 빨강을 쓰지 않는다. 사용자가 뭔가 잘못했다고 느끼지 않게 하기 위해서다. 모든 에러 코드에 같은 회색 마크를 쓴다.

### 6.5 D1 — 주소만으로는 확인이 어려움 (link-only)
- 판정 블록은 `unknown` 색과 마크로 그리고, 헤드라인은 `linkOnly.headline`이다. 퍼센트 줄, 괘선 아래 퍼센트, 근거, 자세히 보기, 공유는 **모두 숨긴다**.
- 블록 아래(20)에 안내 줄로 `saveHint`를 둔다.
- 주 버튼은 [영상 파일로 확인하기], 보조 버튼은 [다른 영상 확인하기].
```
[판정 블록: ◯– / 이 영상은 주소만으로는 확인이 어려워요 / 휴대폰에 저장된 영상이 있다면…]
ⓘ 카카오톡으로 받은 영상은 영상을 연 뒤 '저장'을 누르면…
[■■■ 영상 파일로 확인하기 ■■■]
[ 다른 영상 확인하기 ]
```

### 6.6 공유하기로 들어온 경우 (결과 다시 보내기)
- 결과 화면과 같다. 주 버튼 글자만 [카카오톡 등으로 다시 보내기]로, 아래 안내는 "확인 결과와 영상 링크를 함께 보내요"로 바뀐다. 버튼 왼쪽에 `share-variant-outline` 22 `onInk`를 둔다.
- 공유로 들어왔다는 표시를 따로 띠나 색으로 만들지 않는다. 화면 하나에 행동 하나라는 원칙을 지킨다.

### 6.7 앱 안 유튜브 — 배지와 시트
- 위쪽 바(뒤로 / 쇼츠 처음으로 / 나가기): 면 `paper`, 아래선 1px `line`, 버튼은 아이콘 24 `ink`와 글자 `caption` `ink`를 세로로 둔다. 높이 56.
- 배지: §5.5.
- 배지를 누르면 바텀시트(§5.6)가 열린다. 시트 안의 확인 중 상태는 §6.2를 축소한 것이다(잉크 번짐 + `display` 문구 + [닫고 계속 보기] 보조 버튼). 판정 상태는 §6.3과 같은 판정 블록, 근거, 버튼이다. 주 버튼은 보내기(있으면), 보조 버튼은 [닫고 계속 보기].
- 시트의 에러 상태는 §6.4 모양에 [다시 해보기] 주 버튼과 [닫고 계속 보기] 보조 버튼이다.

### 6.8 크롬 확장 팝업 (폭 380px)
```
┌ 380px ─────────────────────────────┐
│ JJAJJA                       설정   │  ← eyebrow / 텍스트 버튼 accent. 높이 48, 아래선 1px line
│────────────────────────────────────│
│ (16)                                │
│ [판정 블록 §5.4, 헤드라인 24/32]     │  ← 마크 48, 패딩 16
│ (24)                                │
│ 이렇게 판단했어요   (title 20)        │
│ ▪ 근거…            (body 18)        │
│ (16)                                │
│ 이전 결과를 다시 보여드렸어요 (caption)│
│ [■■■■■■ 다시 확인 ■■■■■■] (52)      │
│ ▸ 자세히 (개발자용)  → §7.4           │
└────────────────────────────────────┘
```
- 로딩 상태: 잉크 번짐(지름 20) + "확인하고 있어요…"(`display` 26 serif) + "보통 10초 정도 걸려요" + 경과 시간.
- 에러 상태: §6.4와 같다(마크 48, 헤드라인 24).
- `color-scheme: light`로 고정하고 다크 블록은 지운다(A1).
- 확장에서는 결과 헤드라인 텍스트를 `h1`에, 판정 마크 SVG에 `aria-hidden="true"`를 둔다. 기존 `aria-live="polite"`는 유지한다.

---

## 7. 개발자 모드

같은 팔레트를 쓰되, 실사용자 화면과 **섞이지 않게** 보이게 한다. 대상은 개발자이므로 18pt 규칙을 적용하지 않는다(최소 13).

### 7.1 구분 장치
- **DEV 띠**: 화면 맨 위(상태바 아래)에 높이 28, 면 `dev.band #1F3A5F`(남색 잉크), 글자 `dev.bandText` `font.dev.band`(mono 13 Bold, 자간 1)로 `DEV · api {host} · v{contract}`를 쓴다. 개발 모드가 켜져 있으면 **모든 화면**에 띠를 둔다.
- 개발 영역(결과 화면 하단의 debug 표)은 위에 2px `dev.band` 선과 `DEV` 칩(면 `dev.band`, 글자 `onInk`, mono 12 Bold, radius 4)으로 시작한다. 실사용자 화면 부분과는 32 간격과 굵은 선으로 끊는다.
- 남색은 실사용자 화면에서 링크와 포커스에만 쓰이므로, 넓은 남색 면이 보이면 개발자 모드라는 신호가 된다.

### 7.2 글자와 밀도 (`tokens.font.dev`)
| 토큰 | 값 | 용도 |
|------|----|------|
| `dev.title` | sans 16/22 700 | 카드 제목 |
| `dev.label` | sans 14/20 600 | 라벨 |
| `dev.mono` | mono 14/20 400, tabular | 숫자, id, request_id, 계산식 |
| `dev.monoStrong` | mono 14/20 700 | 최종값 |
| `dev.band` | mono 13/18 700 | DEV 띠 |
- 카드: 면 `surface`, 테두리 1 `lineStrong`, radius 4, 패딩 12, 카드 사이 8. 셀 패딩 4×6.
- 숫자는 오른쪽 정렬과 고정 소수 자리로 쓴다(score 3자리, probability 4자리, `fmtNum` 기존 규칙). 복사할 수 있게(`selectable`) 둔다.

### 7.3 기여도 막대
```
id                status  score  weight  기여도
commfor_224       OK      0.631  0.25    ███░░░░░░░░░  0.126
yt_creator_ai…    OK      1.000  1       ████████████  0.800
hive              FAIL    —      0.5     ╱╱╱╱╱╱╱╱╱╱╱╱  timeout 8s   ← 행 왼쪽 띠 3px dev.fail
d3                SKIP    —      0       (제외)
```
- 막대: 트랙 120×8 `dev.barTrack`(sunken), radius 0. 채움은 `dev.barFill`(ink)이고 폭은 `weight·score / Σweight`(가중 평균에서 차지하는 몫). 막대 오른쪽에 그 몫을 mono 숫자로 쓴다.
- 확정(decisive) 신호는 채움 끝에 2px `dev.band` 세로 눈금을 두고 숫자 옆에 `◆`를 붙인다.
- 계산에서 빠진 신호(weight 0, 실패)는 트랙 위에 `dev.barExcluded` 45° 빗금을 그리고 채움은 비운다. RN에서 빗금이 어려우면 1px `barExcluded` 테두리만 그린 빈 트랙으로 대신한다.
- 상태 칩(radius 4, mono 12 Bold, 패딩 2×6):
  - `OK`: 글자 `dev.ok`, 테두리 1 `dev.ok`, 면 없음
  - `FAIL`: 면 `dev.fail`, 글자 `onInk` (가장 눈에 띄게)
  - `SKIP`·조정: 글자 `dev.warn`, 테두리 1 `dev.warn`
- **실패 강조**: 실패 행은 면 `dev.failTint`, 왼쪽 띠 3px `dev.fail`, reason 글자 `dev.fail`. "서버 정책으로 조정됨" 문장은 `dev.warn` 굵게 쓴다.

### 7.4 크롬 확장의 개발자용 `<details>`
- `summary`: "자세히 (개발자용)" `caption` `inkSecondary`, 앞에 `DEV` 칩. 펼치면 위 2px `dev.band` 선.
- 표: mono 12/16, 셀 테두리 1px `line`, 헤더 면 `sunken`, 헤더 글자 `dev.label`. 기여도 열은 막대 80×6. FAIL 행 규칙은 §7.3과 같다.

---

## 8. 구현 메모

### 8.1 RN (`app/src/ux/theme.ts`)
- `tokens.json`을 import하거나(`resolveJsonModule`) 값을 그대로 옮긴다. 키 이름은 tokens와 맞춘다: `color.paper`, `color.ink`…, `verdict[v].main/tint/icon.mci`, `font.scale.*`, `space`, `radius`, `border`, `size`, `motion`.
- `font.scale.*.family`를 실제 fontFamily로 바꾼다: sans + weight 400/600/700 → `Pretendard-Regular/SemiBold/Bold`(RN 커스텀 폰트는 `fontWeight` 대신 family로 굵기를 고른다. `fontWeight`도 함께 주면 Android에서 가짜 볼드가 생기므로 커스텀 폰트에는 생략한다), serif → `NotoSerifKR-Bold`, mono → `Platform.select({ios:'Menlo', android:'monospace'})`.
- `useFonts`가 끝나기 전에는 시스템 글꼴로 그린다(스플래시를 붙잡지 않는다).
- `StatusBar style="dark"`, 루트 `backgroundColor: color.paper`.

### 8.2 CSS 변수 (`extension/popup.css`)
```css
:root {
  color-scheme: light;
  --paper:#F5F0E6; --surface:#FBF8F2; --sunken:#ECE5D7; --line:#D6CCBA; --line-strong:#665F55;
  --ink:#1A1814; --ink-2:#4A453E; --ink-3:#665F55; --on-ink:#F5F0E6; --ink-pressed:#3A362F;
  --accent:#1F3A5F; --focus:#1F3A5F; --disabled-bg:#E2DACB; --disabled-fg:#5C564D;
  --v-ai:#842820; --v-ai-tint:#F2E0D8; --v-unc:#664610; --v-unc-tint:#F0E5CB;
  --v-real:#2A5434; --v-real-tint:#E1E7D6; --v-unk:#4F4A43; --v-unk-tint:#E7E2D8;
  --dev-band:#1F3A5F;
  --font-sans:"Pretendard",system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;
  --font-serif:"Noto Serif KR","Nanum Myeongjo","AppleMyungjo","Batang",serif;
  --font-mono:ui-monospace,"D2Coding",Menlo,Consolas,monospace;
  --r-sm:4px; --r-md:6px; --bw-ink:1.5px; --bw-strong:2px;
}
```
- 판정 클래스는 `.v-likely_ai / .v-uncertain / .v-likely_real / .v-unknown`처럼 contract enum 그대로 짓는다. 각 클래스는 `--v-main`, `--v-tint`만 다시 정의하고, 블록과 마크는 `var(--v-main)`을 쓴다.
- 포커스: `:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }`.

### 8.3 동기화 규칙
- 색이나 크기를 바꿀 때는 `contrast_check.py`를 고치고 실행한 뒤 이 문서의 표를 갱신한다. 그다음 theme.ts와 popup.css를 맞춘다. 세 곳 중 하나만 고치지 않는다.
- QA는 theme.ts와 popup.css의 hex가 tokens.json과 같은지 대조한다.

---

## 9. 하지 말 것
- 그림자, 그라데이션, 글래스모피즘(반투명 블러), 네온·원색(#FF0000, #00C853 등).
- 판정색으로 화면 전체 배경을 칠하는 것. 판정색 글자로 본문을 쓰는 것.
- 퍼센트를 헤드라인보다 크게 쓰거나 원형 게이지로 강조하는 것.
- 명조를 24pt 미만이나 서버 문자열에 쓰는 것. 16pt 미만 글자(개발자 모드 제외).
- 스피너, 튀는 애니메이션, 잉크 번짐 외의 반복 애니메이션.
- 에러 화면에 빨강 쓰기. `likely_real`에 "안전", "진짜" 같은 체크 배지 문구를 붙이는 것.
- 개발자 모드 요소(mono, DEV 칩, 남색 면)를 실사용자 화면에 섞는 것.
