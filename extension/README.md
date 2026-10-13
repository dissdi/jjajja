# jjajja 영상 확인 — 데스크탑 크롬 확장 (내부 시연용)

유튜브에서 영상을 보는 중에 확장 버튼을 한 번 누르면, 그 영상이 AI로 만든 영상일 가능성을 보여줍니다.
빌드 도구 없이 이 폴더를 그대로 크롬에 올리면 됩니다. 크롬 웹 스토어에는 올리지 않습니다.

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

## 동작

| 상황 | 확장 버튼 |
|------|----------|
| `youtube.com/watch?v=…`, `youtube.com/shorts/…` (www, m 포함) | 켜짐 — 빨간 돋보기 아이콘 |
| 그 밖의 모든 페이지(유튜브 홈·검색·채널, 다른 사이트) | 꺼짐 — 회색 아이콘, 눌러도 반응 없음 |

유튜브는 SPA라 영상을 넘겨도 페이지를 다시 불러오지 않습니다. `tabs.onUpdated`(주소 변화)와
content script 의 `yt-navigate-finish` 이벤트 두 경로로 감지해 버튼 상태를 맞춥니다.

버튼을 누르면:

1. 팝업이 열리면서 바로 확인을 시작합니다(원클릭). "확인하고 있어요… 보통 10초 정도 걸려요", 최대 45초(계약 v1.2)
2. service worker 가 `POST {서버}/v1/detect` 에 `{ "url": "<정규화한 영상 주소>", "source": "paste" }` 를 보냅니다
3. 결과: 색 + 아이콘 + 헤드라인·보조 문장 → "AI 가능성 n%" → "이렇게 확인했어요" 근거 최대 3개
   - 서버가 `debug` 필드를 주면(개발 모드) 맨 아래 접힌 **자세히 (개발자용)** 에 신호별 id/status/score/weight/reason 표
4. 같은 영상은 브라우저를 닫을 때까지 결과를 기억합니다(`chrome.storage.session`). 다시 누르면 즉시 표시하고
   "n분 전에 확인한 결과예요" 를 보여줍니다. **다시 확인** 버튼은 서버에 새로 요청합니다
5. 팝업을 닫아도 진행 중인 요청은 계속되고, 끝나면 결과가 저장되어 다시 열 때 바로 보입니다

에러는 계약 에러 코드를 쉬운 문구로 바꿔 보여줍니다. 서버에 연결하지 못하면 **설정 열기** 버튼이 나옵니다.

## 권한

| 권한 | 이유 |
|------|------|
| `storage` | 서버 주소(local), 세션 결과 캐시(session — 브라우저 닫으면 삭제) |
| host: `youtube.com` (www, m) | 탭 주소 읽기(버튼 활성화), SPA 이동 감지 content script |
| host: `localhost`, `127.0.0.1` | 기본 서버 주소 |
| optional host: `https://*/*`, `http://*/*` | 옵션 페이지에서 **입력한 주소 하나만** 런타임에 요청. 미리 허락받는 것은 없음 |

`tabs`, `activeTab`, `scripting` 권한은 쓰지 않습니다. 시청 기록 등 사용자 데이터는 저장하지 않습니다.

## 파일

```
manifest.json      MV3 매니페스트
background.js      service worker — 버튼 활성/비활성, 서버 호출, 세션 캐시
content.js         유튜브 SPA 이동 알림(yt-navigate-finish) — 페이지 내용은 읽지 않음
popup.html/js/css  결과 팝업
options.html/js    서버 주소 설정
lib/video.js       탭 URL → 영상 판별·정규화 (순수)
lib/server.js      서버 주소 정규화·권한 패턴 (순수)
lib/contract.js    응답 검사 (계약 v1.3)
lib/display.js     응답 → 표시 모델, 에러 → 문구 (순수)
lib/api.js         POST /v1/detect, GET /v1/health (fetch 주입)
icons/             active-*.png(빨강), inactive-*.png(회색)
test/              node --test
package.json       테스트용 ESM 지정 (크롬은 무시)
```

## 테스트

```sh
cd extension
/data2/donginson/conda/envs/jjajja/bin/node --test test/
```
