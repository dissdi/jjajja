# extension 작업 노트

## 2026-10-19 — 디자인 시스템(#21) + 로그인 필수(#20, 계약 v2.0)

### 결정
- **토큰 → CSS**: `tools/gen-tokens.mjs` 가 `design/tokens.json` 을 읽어 `tokens.css` 를 만들고 커밋한다(빌드 도구 없이 로드).
  변수 이름은 design-system.md §8.2(`--paper`, `--ink-2`, `--v-ai` …) 그대로, 없는 토큰은 같은 규칙으로 늘림
  (`--fs-*/--lh-*/--fw-*`, `--sp-*`, `--r-*`, `--bw-*`, `--size-*`, `--dev-*`, `--motion-*`). `font.extensionOverride` 는 생성 때 적용
  (display 26/34, headline 24/32, button 18/26). 판정 클래스 `.v-likely_ai` 등은 `--v-main/--v-tint` 만 다시 정의.
  `test/tokens.test.js` 가 커밋본 = 생성 결과인지, CSS/HTML 에 hex·box-shadow·prefers-color-scheme 이 없는지 검사.
- **CSS 구조**: `fonts.css`(@font-face) → `tokens.css`(자동) → `ui.css`(공통 부품) → `popup.css`(배치). 옵션 페이지도 같은 파일.
- **글꼴**: Pretendard v1.3.9 woff2 3종 원본 그대로(약 2.3MB, 서버 문자열에도 쓰므로 서브셋하지 않음),
  Noto Serif KR Bold v2.003 → KS X 1001 한글 2,350자 + ASCII + 문장부호 서브셋 woff2(413KB, `tools/subset-serif.py`).
  명조는 고정 문구 헤드라인(판정·에러 제목·로그인 제목·"확인하고 있어요…"·"내 기록"·"설정")에만, `evidence_ko` 등 서버 문자열은 Pretendard.
  `font-display: swap`. `fonts/OFL.txt` 에 두 글꼴 저작권 + OFL 1.1 전문.
- **판정 마크**: 인라인 SVG(선 2) + CSS 도장 테두리. likely_ai 만 각진 사각 도장 + 삼각형 느낌표, 나머지는 원 도장 + ?/✓/–.
  `aria-hidden`, 헤드라인은 `h1`. 에러는 모든 코드에 회색(unknown) 도장, 빨강 없음, 첫 문장을 명조 제목으로·나머지는 본문.
- **개발자 영역**: 서버가 `debug` 를 보낼 때만 남색 DEV 띠(`DEV · api {origin} · v2.0`) + 접힌 `<details>`.
  표: id / 상태 칩(OK·FAIL·SKIP) / score(3자리) / w / 기여도 막대 80×6(`weight·score / Σweight`, Σ는 계산에 들어간 신호 =
  weight>0·ok·score 있음), 확정 신호 ◆ + 남색 눈금, 제외는 빗금, FAIL 행 failTint + 왼쪽 3px, reason 은 아래 행.
  ※ 기여도는 디자인 문서 공식 그대로 — 서버 앙상블이 다른 식(규칙 신호 처리 등)이면 막대와 p 가 안 맞을 수 있다.
- **툴바 아이콘**: `tools/gen-icons.py`(Pillow) — 활성 = 잉크 도장 + 크림 돋보기, 비활성 = disabledBg 면 + lineStrong 테두리·돋보기.
- **로그인 구조**: 크롬 API 를 주입받는 `lib/service.js`(status/login/signup/logout/detect/history/health)를 background.js 가 라우팅.
  팝업 화면 전이는 순수 리듀서 `lib/flow.js`. 둘 다 node 테스트.
  - 토큰: `chrome.storage.local['auth'] = { token, email, origin, at }` 한 곳. 팝업 응답에는 토큰을 넣지 않는다(`{loggedIn,email,server}`).
  - 토큰은 받은 서버 origin 과 묶는다. 서버 주소가 바뀌면 지운다(시연마다 터널 주소가 바뀌므로, 다른 서버로 토큰 유출 방지).
  - 인증 필요 호출에서 401(코드가 `invalid_credentials` 가 아니면 본문이 없어도) → 토큰 + 세션 결과 캐시 삭제 → `auth_required/expired`.
  - 토큰 없으면 캐시가 있어도 결과를 보여주지 않는다(로그인 필수). 로그아웃은 토큰을 먼저 지우고 `POST /v1/auth/logout` 은 best-effort.
  - signup·login 둘 다 `device_name: "Chrome 확장"`(계약 v2.0 보완: signup 선택 필드). signup 201 토큰을 그대로 쓴다.
  - 회원가입은 8자 미만이면 서버에 보내지 않고 바로 안내(서버도 `weak_password` 로 막음). 로그인 모드는 길이 검사 안 함.
  - 메시지 출처 제한: 로그인·확인·기록 메시지는 `sender.url` 이 확장 페이지일 때만 처리(content script 는 yt-nav 만).
- **계약 v2.0 보완 반영**: `not_found`(기록 삭제용) 문구 매핑만(확장은 삭제 기능 없음), history `source: null` 허용,
  항목 하나가 이상하면 그 항목만 버림. 기록 링크는 유튜브 주소일 때만 `chrome.tabs.create`(서버가 준 임의 URL 을 열지 않음).

### 문구 가정 (senior-ux-korean 에 로그인 문구가 없어 같은 원칙으로 작성 — senior-ux-designer 검토 요청)
| 키 | 문구 |
|----|------|
| 로그인 제목 / 안내 | 로그인해 주세요 / 로그인하면 확인한 영상 기록을 휴대폰 앱에서도 볼 수 있어요 |
| 회원가입 제목 / 안내 | 회원가입 / 이메일과 비밀번호만 있으면 돼요 |
| 버튼 | 로그인 · 가입하고 시작하기 (진행 중: 로그인하고 있어요… / 가입하고 있어요…) |
| 전환 | 처음 쓰시나요? [회원가입] / 이미 가입하셨나요? [로그인] |
| 8자 안내(회원가입) | 비밀번호는 8자 이상으로 정해 주세요 |
| `invalid_credentials` | 이메일이나 비밀번호가 맞지 않아요. 다시 확인해 주세요 |
| `email_taken` | 이미 가입한 이메일이에요. 로그인해 주세요 (→ 로그인 모드로 전환) |
| `invalid_email` | 이메일 주소를 다시 확인해 주세요. 예: hong@example.com |
| `weak_password` | 비밀번호를 8자 이상으로 정해 주세요 |
| 빈 칸 | 이메일을 넣어 주세요 / 비밀번호를 넣어 주세요 |
| 401 만료 | 로그인이 끝났어요. 다시 로그인해 주세요 |
| `not_found` | 찾는 기록이 없어요. 이미 지워졌을 수 있어요 |
| 계정 줄 | {email} 로 로그인했어요 · [내 기록] [로그아웃] |
| 내 기록 | 최근에 확인한 영상 10개예요. 휴대폰 앱에서 확인한 것도 함께 보여요 / 비었을 때: 아직 확인한 영상이 없어요 / 파일: 영상 파일로 확인했어요 / [영상 열기] [돌아가기] |

### 검증
- `node --test test/` **51개 통과**: 기존 22개 + 로그인 상태 전이(flow), 401 처리·토큰 저장 위치·서버 변경·로그아웃(service),
  Bearer 헤더·204(api), 로그인 문구·기록 표시, tokens.css 일치·스타일 규칙·글꼴 파일·매니페스트(tokens).
- 실제 크롬(Playwright chromium, headless)에 확장을 올리고 v2.0 흉내 서버로 확인: service worker 로드, 토큰 없음 → auth_required,
  잘못된 비밀번호 → invalid_credentials, 로그인 → `storage.local` 에만 토큰(session 에 없음), detect 에 Bearer, history `limit=10`,
  401 → 토큰 삭제·expired, 로그아웃 → 서버에 Bearer 로 logout 후 로그아웃 상태, 팝업 로그인 화면·글꼴 로드·배경 `#F5F0E6`.
- 팝업 각 화면(로그인/회원가입 에러/확인 중/결과 3종/에러/네트워크/내 기록/DEV 표)과 옵션 페이지를 크롬으로 캡처해 확인.
- 실제 v2.0 서버와는 아직 연결해 보지 않음(서버 인증은 다른 에이전트가 동시에 구현 중) → 아래 수동 확인.

### 수동 확인 필요 (크롬 + v2.0 서버)
1. 회원가입 → 바로 확인 시작, 휴대폰 앱 기기 목록(`GET /v1/me`)에 "Chrome 확장" 으로 보이는지
2. 서버에서 토큰 폐기(다른 기기에서 로그아웃 아님 — 이 기기 토큰) 후 [다시 확인] → 로그인 화면 + 만료 안내
3. [내 기록]에 휴대폰 앱에서 확인한 항목이 함께 보이는지, [영상 열기]가 새 탭으로 열리는지
4. macOS/Windows 에서 명조 헤드라인·Pretendard 가 실제로 적용되는지(개발자 도구 → Rendered Fonts), 툴바 아이콘 밝은/어두운 테마
5. 터널 주소로 바꾼 뒤 이전 로그인이 풀리고 다시 로그인되는지

---

## 2026-10-13 — 첫 구현

## 결정
- **활성화 방식**: `declarativeContent` 대신 `action.disable()`(전역 기본) + 탭 단위 `enable/disable` + `setIcon`.
  declarativeContent 는 아이콘을 탭별로 바꾸기 번거롭고(ImageData 필요), 상태를 코드로 테스트하기 어렵다.
  판별은 `lib/video.js` 순수 함수 하나로 통일.
- **SPA 감지 이중화**: `tabs.onUpdated`(pushState 도 `changeInfo.url` 로 옴) + content script `yt-navigate-finish`.
  `tabs` 권한 없이 youtube host 권한만으로 유튜브 탭의 url 이 보인다. 다른 사이트 탭은 url 이 비어 있어 자동으로 꺼짐 처리.
- **보내는 URL**: 탭 URL 을 그대로 보내지 않고 `https://www.youtube.com/watch?v=ID` / `.../shorts/ID` 로 정규화
  (재생목록 `list`, 시간 `t`, 추적 파라미터 제거 → 서버 캐시 적중률↑). 서버 `rules/youtube.py` 가 두 형식 모두 처리.
- **source**: 계약 값 중 `"paste"` 사용 (새 값 추가 금지 지시). 통계상 확장 경로를 구분할 수 없다는 한계 있음 —
  구분이 필요하면 계약에 값을 먼저 추가해야 한다(detection-engineer 요청 사항).
- **캐시 키**: `result:youtube:<video_id>` — watch/shorts 로 같은 영상을 열어도 같은 결과. `storage.session` 이라 브라우저를 닫으면 삭제.
  service worker 메모리의 in-flight Map 으로 같은 영상 동시 요청을 하나로 합친다.
- **제한 시간**: 45초(AbortController). 계약 v1.2 URL 서버 보장 40초.
- **권한**: localhost/127.0.0.1 은 기본 host_permissions(포트 무관). 그 외 주소는 옵션 페이지 [저장] 클릭 핸들러에서
  `permissions.request({origins:["https://host/*"]})` — 사용자 동작 안에서 첫 await 로 호출해야 한다. 주소를 바꾸면 이전 주소 권한 반납.

## UX 문구 조정 (senior-ux-korean 기준, 확장 맥락에 맞춘 부분)
- verdict 표·에러 표는 그대로. 아이콘은 색 외에 문자도 다르게: `!` `?` `✓` `–` (색각 이상 대비).
- `invalid_url`: 원문은 "공유 → 링크 복사 후 붙여넣기" 안내인데 확장에는 붙여넣기가 없다 → "유튜브 영상 화면에서 다시 눌러 주세요".
- `unsupported_platform`: "유튜브 쇼츠" → "유튜브 영상" (확장은 일반 watch 영상도 받음).
- D1(주소 확인 + unknown + partial): 헤드라인은 원문, 보조 문장은 확장에 파일 업로드가 없어
  "영상 파일이 있다면 휴대폰 앱에서 파일로 확인할 수 있어요" 로 변경. 퍼센트·근거 숨김.
- 근거: status ok + 문장 있음, decisive 먼저, 최대 3개. **꺼진 모델(kind=model, weight 0) 근거는 숨김** —
  실제 서버(디버그 모드)에서 d3 가 weight 0 인데 "화면 움직임만으로는 판단하기 어려워요" 가 근거로 나와 판정과 무관한 문장이 섞였다.
  규칙 쪽 weight 0(설명용)은 계약대로 보여준다.
- 확장 전용 에러(네트워크/권한/서버 주소 없음/영상 화면 아님)는 같은 톤으로 작성, 네트워크·권한은 [설정 열기] 버튼.
- "자세히 (개발자용)": 서버가 debug 를 하나라도 보낼 때만. 사용자용 "자세히 보기"(모델 n%·규칙 있음/없음)는 이번 범위에서 만들지 않았다.
- 팝업은 380px 폭 제약 때문에 본문 18px / 헤드라인 24px, 버튼 높이 52px.

## 검증
- `node --test test/` 22개 통과 (URL 판별, 서버 주소 정규화, 응답 검사, 표시 모델, 에러 매핑, fetch 주입 POST/에러/timeout).
- 로컬 서버(`localhost:8000`, 디버그 모드)에 `lib/api.js` 로 실제 요청 → 파싱·표시 모델 정상, debugRows 5개.
  - 참고(탐지 쪽): `dQw4w9WgXcQ`(실사 뮤직비디오)가 hive 0.0022 / commfor 0.02 인데 ai_probability 0.40 → `uncertain`.
    규칙 weight 0 신호들이 0.5 로 들어가 평균을 끌어올리는지 detection-engineer 확인 필요 (확장은 서버 verdict 를 그대로 씀).
- 크롬 실제 로드는 이 서버에서 못 해 봄 → README 의 수동 확인 항목 참고.

## 수동 확인 필요 (크롬에서)
1. 로드 시 매니페스트 오류 없음, 유튜브 홈 → 회색/비활성, 영상 클릭(SPA 이동) → 빨강/활성, 홈으로 돌아가면 다시 비활성
2. shorts 에서 위아래로 넘길 때 버튼 유지, 새 영상으로 결과 요청되는지
3. 터널 주소 저장 시 권한 프롬프트 → 허용 후 결과 표시, 거부 시 문구
4. 팝업 닫았다 다시 열기 → 캐시 결과 즉시 + "n분 전" 안내, [다시 확인] 동작
5. 서버 끄고 누르기 → 네트워크 문구 + [설정 열기]
