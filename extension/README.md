# jjajja 영상 확인 — 데스크탑 크롬 확장 (내부 시연용)

유튜브에서 영상을 보는 중에 확장 버튼을 한 번 누르면, 그 영상이 AI로 만든 영상일 가능성을 보여줍니다.
빌드 도구 없이 이 폴더를 그대로 크롬에 올리면 됩니다. 크롬 웹 스토어에는 올리지 않습니다.
**v0.2.0부터 로그인이 필요합니다**(계약 v2.0). 서버도 v2.0(인증) 이상이어야 합니다.
화면은 디자인 시스템 "잉크 & 크림"(`.claude/skills/senior-ux-korean/references/design-system.md`)을 따릅니다.

## 설치 (크롬 개발자 모드)

1. 크롬 주소창에 `chrome://extensions` 입력
2. 오른쪽 위 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램을 로드합니다** → 이 `extension/` 폴더 선택
4. 퍼즐 아이콘(확장 프로그램) → **jjajja 영상 확인** 옆 핀 버튼으로 툴바에 고정
5. 코드를 고친 뒤에는 `chrome://extensions` 에서 새로고침(↻) 버튼. 이미 열려 있던 유튜브 탭은 새로고침해야 SPA 이동 감지가 붙습니다

크롬 116 이상 필요(Manifest V3, 모듈 service worker).

## 서버 주소 설정

- 기본값: `http://localhost:8000` (탐지 서버를 같은 컴퓨터에서 띄운 경우, 추가 허락 불필요)
- 시연 때: 확장 아이콘 우클릭 → **옵션**(또는 팝업 오른쪽 위 **설정**) → 임시 터널 주소 입력
  (예: `https://abc-def.trycloudflare.com`, `https://` 생략 가능) → **저장**
- localhost 가 아닌 주소는 저장할 때 크롬이 "이 사이트에 대한 액세스 허용" 을 물어봅니다. **허용**을 눌러야 합니다.
  입력한 주소 한 곳에만 허락을 받고, 주소를 바꾸면 이전 주소 허락은 돌려줍니다(최소 권한).
- **연결 확인** 버튼은 `GET /v1/health` 로 서버가 켜져 있는지 확인합니다.
- 터널 주소는 시연마다 바뀌므로 매번 다시 저장하세요.

서버 쪽 CORS 설정(`JJAJJA_CORS_ORIGINS`)은 필요 없습니다. 확장 service worker 는 host 권한으로 직접 호출합니다.
개발용 원인 표("자세히")를 보려면 서버를 `JJAJJA_DEBUG=1` 로 띄우세요.

## 로그인 (계약 v2.0)

1. 처음 버튼을 누르면 **로그인 화면**이 나옵니다(이메일·비밀번호). 계정이 없으면 아래 **[회원가입]** 으로 바꿉니다
   (비밀번호 8자 이상 안내). 가입·로그인 요청에는 `device_name: "Chrome 확장"` 이 들어가 휴대폰 앱의 기기 목록에 이 이름으로 보입니다
2. 성공하면 **바로 지금 보는 영상을 확인**합니다
3. 팝업 아래 **[내 기록]** = 최근 10개(`GET /v1/history?limit=10`, 휴대폰 앱에서 확인한 것도 함께), **[로그아웃]** = 서버 토큰 폐기 + 확장에서 삭제
4. 서버가 `401` 을 주면(만료·폐기) 토큰을 지우고 "로그인이 끝났어요. 다시 로그인해 주세요" 와 함께 로그인 화면으로 돌아갑니다
5. 설정에서 서버 주소를 바꾸면 이전 서버의 토큰은 쓰지 않고 지웁니다(다른 서버로 토큰을 보내지 않음) → 다시 로그인

토큰은 `chrome.storage.local` 에만 저장하고, 서버 호출은 service worker 에서만 합니다. 팝업은 `{ loggedIn, email }` 만 받고
토큰을 직접 읽지 않습니다. 토큰은 `Authorization: Bearer` 헤더로만 보냅니다(URL·로그에 남기지 않음).

## 동작

| 상황 | 확장 버튼 |
|------|----------|
| `youtube.com/watch?v=…`, `youtube.com/shorts/…` (www, m 포함) | 켜짐 — 잉크색 도장에 크림색 돋보기 |
| 그 밖의 모든 페이지(유튜브 홈·검색·채널, 다른 사이트) | 꺼짐 — 회색 종이 도장, 눌러도 반응 없음 |

유튜브는 SPA라 영상을 넘겨도 페이지를 다시 불러오지 않습니다. `tabs.onUpdated`(주소 변화)와
content script 의 `yt-navigate-finish` 이벤트 두 경로로 감지해 버튼 상태를 맞춥니다.

버튼을 누르면(로그인한 상태):

1. 팝업이 열리면서 바로 확인을 시작합니다(원클릭). 잉크 번짐 + "확인하고 있어요… 보통 10초 정도 걸려요", 최대 45초(계약 v1.2)
2. service worker 가 `POST {서버}/v1/detect` 에 `{ "url": "<정규화한 영상 주소>", "source": "paste" }` + Bearer 토큰을 보냅니다
3. 결과: 판정 블록(왼쪽 띠·도장 마크·명조 헤드라인·괘선·"AI 가능성 n%"·보조 문장) → "이렇게 판단했어요" 근거 최대 3개
   - 서버가 `debug` 필드를 주면(개발 모드, `JJAJJA_DEBUG=1`) 맨 위 남색 **DEV 띠**와 맨 아래 접힌 **자세히 (개발자용)**:
     신호별 상태 칩(OK/FAIL/SKIP), score·weight 고정폭 숫자, 기여도 막대(`weight·score / Σweight`, 확정 신호 ◆, 제외는 빗금), 실패 사유
4. 같은 영상은 브라우저를 닫을 때까지 결과를 기억합니다(`chrome.storage.session`, 로그아웃·401 때 삭제). 다시 누르면 즉시 표시하고
   "n분 전에 확인한 결과예요" 를 보여줍니다. **다시 확인** 버튼은 서버에 새로 요청합니다
5. 팝업을 닫아도 진행 중인 요청은 계속되고, 끝나면 결과가 저장되어 다시 열 때 바로 보입니다

에러는 계약 에러 코드를 쉬운 문구로 바꿔 보여줍니다(회색 도장, 빨강 없음). 서버에 연결하지 못하면 **설정 열기** 버튼이 나옵니다.

## 디자인·글꼴

- 색·크기·간격은 `design/tokens.json` 에서 만든 `tokens.css` 의 CSS 변수만 씁니다. 라이트 모드 전용, 그림자 없음
  - 토큰을 바꾼 뒤: `node extension/tools/gen-tokens.mjs` (확인만: `--check`). `test/tokens.test.js` 가 커밋된 파일과 대조합니다
- 글꼴은 패키지 안에 들어 있습니다(원격 로드 없음, `fonts/OFL.txt`):
  - Pretendard Regular/SemiBold/Bold (v1.3.9 woff2) — 본문·버튼·서버 문자열
  - Noto Serif KR Bold 서브셋(KS X 1001 한글 2,350자 + ASCII, 약 400KB) — **고정 문구 헤드라인에만**.
    다시 만들기: `pip install fonttools brotli` 후 `python extension/tools/subset-serif.py <NotoSerifKR-Bold.otf> extension/fonts/NotoSerifKR-Bold.subset.woff2`
- 툴바 아이콘: `python extension/tools/gen-icons.py`(Pillow) — tokens.json 색으로 활성/비활성 PNG 를 다시 만듭니다

## 권한

| 권한 | 이유 |
|------|------|
| `storage` | 서버 주소·로그인 토큰·이메일(local), 세션 결과 캐시(session — 브라우저 닫으면 삭제) |
| host: `youtube.com` (www, m) | 탭 주소 읽기(버튼 활성화), SPA 이동 감지 content script |
| host: `localhost`, `127.0.0.1` | 기본 서버 주소 |
| optional host: `https://*/*`, `http://*/*` | 옵션 페이지에서 **입력한 주소 하나만** 런타임에 요청. 미리 허락받는 것은 없음 |

`tabs`, `activeTab`, `scripting` 권한은 쓰지 않습니다. 확장은 시청 기록을 저장하지 않습니다(확인 기록은 계약 v2.0에 따라 서버가 계정에 남김).
로그인·확인·기록 메시지는 확장 자신의 페이지(팝업·옵션)에서 온 것만 받고, 유튜브 페이지의 content script 는 `yt-nav` 만 보낼 수 있습니다.

## 파일

```
manifest.json      MV3 매니페스트 (v0.2.0)
background.js      service worker — 버튼 활성/비활성, 메시지 라우팅 (lib/service.js 사용)
content.js         유튜브 SPA 이동 알림(yt-navigate-finish) — 페이지 내용은 읽지 않음
popup.html/js/css  팝업 — 로그인/회원가입, 확인 중, 결과, 에러, 내 기록
options.html/js    서버 주소 설정, 로그인 상태
fonts.css          @font-face (패키지 안 woff2)
tokens.css         자동 생성 CSS 변수 (design/tokens.json)
ui.css             공통 부품(버튼·입력칸·판정 블록·도장 마크·잉크 번짐·DEV 칩)
fonts/             Pretendard 3종, Noto Serif KR Bold 서브셋, OFL.txt
lib/service.js     로그인·토큰·401·확인·기록 (크롬 API 주입 → 테스트 가능)
lib/flow.js        팝업 화면 상태 전이 (순수)
lib/video.js       탭 URL → 영상 판별·정규화 (순수)
lib/server.js      서버 주소 정규화·권한 패턴·엔드포인트 (순수)
lib/contract.js    응답 검사 (계약 v2.0)
lib/display.js     응답 → 표시 모델, 에러·로그인 문구, 기록 항목, 기여도 (순수)
lib/marks.js       판정 마크 SVG
lib/api.js         /v1/detect, /v1/auth/*, /v1/history, /v1/health (fetch 주입)
icons/             active-*.png(잉크), inactive-*.png(회색)
tools/             gen-tokens.mjs, subset-serif.py, gen-icons.py
test/              node --test
package.json       테스트용 ESM 지정 (크롬은 무시)
```

## 테스트

```sh
cd extension
/data2/donginson/conda/envs/jjajja/bin/node --test test/
```
