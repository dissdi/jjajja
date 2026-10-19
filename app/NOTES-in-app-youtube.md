# 앱 안 유튜브 (기능 2, 시연용) — mobile-engineer 노트

브랜치 `feat/in-app-youtube`. 출시용이 아니라 시연용. 계약(detect-api-contract v1.3)은 바꾸지 않았다.

## 구현한 것
| 항목 | 위치 | 내용 |
|------|------|------|
| 화면 | `src/screens/YoutubeScreen.tsx` | `react-native-webview`(13.16.1, `npx expo install`)로 `https://m.youtube.com/shorts` 전체 화면(안전 영역만 비움, 위쪽 막대 없음). 뒤로/쇼츠 처음으로/나가기는 배지 → 바텀시트 아래 선 버튼 3개. 화면 켜짐 유지 |
| 웹 대체 | `src/screens/YoutubeScreen.web.tsx` | Metro가 웹 번들에선 이 파일을 고른다 → WebView를 불러오지 않음. "휴대폰 앱에서만 동작해요" + [처음으로]. `expo export --platform web` 번들에 WebView 코드 없음 확인 |
| 영상 전환 감지 | `src/youtube/bridge.ts` | 주입 스크립트: `history.pushState/replaceState` 후킹, `popstate`, `yt-navigate-finish`, 400ms 주기 `location.href` 확인 → 바뀌었을 때만 `ReactNativeWebView.postMessage({type:'jjajja:url', url})`. 보조로 `onNavigationStateChange` |
| 영상 ID | `src/youtube/videoId.ts` | `/shorts/<11자>`, `/watch?v=<11자>`, `youtu.be/<11자>` (youtube.com 및 하위 도메인만). 서버에는 추적 파라미터 없는 표준 주소(`https://www.youtube.com/shorts/<id>` / `watch?v=<id>`)를 보낸다 |
| 자동 확인 | `src/youtube/autoCheck.ts` | `AutoChecker`(React 무관 클래스) + `useAutoCheck` 훅. 새 ID가 0.8초 유지되면 `detect(url, 'paste')`. 넘기면 타이머 취소 + 진행 중 요청 `AbortController.abort()`, 늦게 온 응답 무시. 성공 결과만 메모리 캐시(id→결과, 앱 프로세스 동안 모듈 단위 — 화면을 나갔다 와도 유지). 오류는 캐시 안 함. `retry()`는 캐시 무시 |
| 배지 | `src/youtube/badge.ts`, `YoutubeScreen` 내 `Badge` | WebView 위 네이티브 뷰. 기본 위치 오른쪽 위(유튜브 상단 막대 아래 top 60, right 12), 끌어서 이동(영역 안으로 자름). 상태: 확인 중(스피너) / verdict 색 원+아이콘 + "AI 가능성 n%" / unknown·주소만으로 어려움 → "확인하지 못했어요" / 오류 → 새로고침 아이콘 + "확인하지 못했어요". verdict는 서버 값 그대로 |
| 바텀시트 | `YoutubeScreen` 내 `SheetBody` | RN `Modal`(slide). 결과면 기존 `ResultScreen` 그대로(헤드라인·근거·자세히 보기·개발 모드 debug 표·가족에게 보내기). 맨 아래 보조 버튼만 '닫고 계속 보기'(`ResultScreen`에 선택 prop `againLabel` 추가, 기본값 유지). 오류면 `errorCopyFor` 문구 + [다시 해보기]. D1(주소만으로 어려움)의 [영상 파일로 확인하기]는 시트를 닫고 App의 업로드 흐름으로 넘긴다 |
| 진입 | `HomeScreen` | 선택 prop `onOpenYoutube` 있을 때만 맨 아래 보조 버튼 "유튜브 보면서 확인하기 (시연)" |
| App.tsx | 최소 변경 | `Screen`에 `{ name: 'youtube' }`, 렌더 분기 1개, Home에 `onOpenYoutube`, 하드웨어 뒤로가기는 youtube 화면이 직접 처리(`return false`) |
| 앱 열기 차단 | `isAllowedInWebView` | `intent://`, `vnd.youtube:` 등 비 http(s) 이동을 막아 유튜브 앱으로 튀어 나가지 않게 |
| UA 조정 | `YoutubeScreen` | iOS: 기본 UA + `Version/18.0 Mobile/15E148 Safari/604.1`, Android: `wv` 표식 없는 크롬 모바일 UA 고정. 재생 차단을 줄이려는 시연용 조치 |

새 문구는 `copy.ts`의 `home.youtubeButton/youtubeHint`, `youtube.*`([추가·시연] 표시) — senior-ux-designer 검토 대상.

## 테스트
- `npx tsc --noEmit` 통과, `npx jest` 228개 통과 (신규: `__tests__/youtube.test.ts` ID 추출·브리지·배지·위치 자르기, `__tests__/autoCheck.test.ts` 디바운스·취소·캐시·retry·dispose, `__tests__/youtubeScreen.test.tsx` 화면 흐름(가짜 WebView로 메시지 주입 → 0.8초 뒤 fetch 본문 `{url, source:'paste'}` → 배지 → 시트), 웹 대체 화면, 홈 진입·나가기)
- 주입 스크립트는 문자열로 끝나지 않게 가짜 window/history/location에서 실제로 실행해 검사한다
- `__mocks__/react-native-webview.js`: jest에서 네이티브 모듈 없이 import되도록 자동 목 (기존 `screens.test.tsx`가 App을 import하므로 필요)
- `npx expo export --platform ios/android/web` 번들 성공

## 실기기에서 확인해야 할 것 (이 환경에서 못 함)
1. Expo Go(SDK 57)에서 m.youtube.com 쇼츠 재생 여부, 봇 확인 페이지 여부 (iOS/Android 각각)
2. 쇼츠 위아래로 넘길 때 주입 스크립트가 주소 변화를 잡는지 (`/shorts` → `/shorts/<id>` 리다이렉트 포함). 못 잡으면 400ms 주기 확인이 안전망
3. 배지 기본 위치가 유튜브 상단 막대/오른쪽 버튼과 겹치지 않는지, 끌기와 탭이 충돌하지 않는지
4. 바텀시트 높이(88%)와 결과 스크롤, Android 뒤로가기 순서
5. Android UA 고정이 오히려 문제를 만들면 `userAgent` 줄을 지우고 재시도

## 알려진 한계
- 구글 로그인 불가 (구글이 WebView 로그인 차단) — 비로그인 쇼츠만
- 유튜브가 WebView 재생을 막거나 봇 확인을 띄울 수 있음
- 영상마다 서버가 다운로드 → 많이 넘기면 서버 IP가 유튜브에 차단될 위험 (0.8초 머무름·캐시로 완화만)
- 유튜브 화면을 감싸는 방식이라 스토어 출시 불가, 시연 전용
- 캐시는 메모리 전용 — 앱을 완전히 끄면 사라짐
