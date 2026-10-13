# 공유하기로 확인 + 다시 보내기 — 구현 노트 (GitHub #12 기능 3)

브랜치 `feat/share-to-share`. 빌드·계정 안내는 `README.md` "공유하기로 확인" 절.

## 흐름
1. 유튜브/카카오톡 [공유] → jjajja 선택
2. 네이티브(expo-share-intent)가 텍스트를 앱에 넘김 → `useShareEntry` → `App.run({ kind: 'url', url: <받은 문구 그대로>, fromShare: true })`
3. 홈을 건너뛰고 S2 "확인하고 있어요" → S3 결과 (에러면 S4, 기존 문구)
4. 결과 화면 버튼이 [카카오톡 등으로 다시 보내기]로 바뀜 → `Share.share({ message })` (OS 공유 시트)

## 설계 결정
| 항목 | 결정 | 이유 |
|------|------|------|
| 라이브러리 | `expo-share-intent@^8.0.1` (Expo SDK 57 대응표 확인), 필요 의존 `expo-linking`, `expo-constants` | 커스텀 plugin보다 유지비 낮음. v6+는 patch-package 불필요 |
| Android 필터 | `text/plain`만 | 요구사항. 영상 파일 공유(`video/*`)는 후속 — 업로드 경로와 연결 가능 |
| iOS 활성화 | Text + WebURL + WebPage (각 1개) | 유튜브 iOS는 URL, 카카오톡은 텍스트로 넘기는 경우가 있음 |
| iOS 확장 이름 | `jjajja AI 확인` (타깃 `jjajjaAI`) | 처음 `jjajja`로 하자 영문만 남긴 타깃 이름이 메인 타깃과 겹쳐 확장이 **조용히 생략**됨(prebuild 로그 "already exists... Skipping"). 이름을 바꿀 때 영문·숫자 부분이 `jjajja`와 같으면 안 됨 |
| 서버로 보낼 값 | 받은 텍스트를 trim만 해서 그대로, `source: "share"` | 서버가 URL 추출·단축 링크 해석(계약). iOS에서 text에 주소가 없고 webUrl만 따로 오면 둘을 이어 붙임 |
| 다시 보낼 링크 | 공유 문구의 첫 주소(`extractUrl`), 단축 링크는 그대로 | 제목까지 붙이면 메시지가 길어짐. 받는 사람이 보낸 사람과 같은 링크를 보게 |
| 버튼 | 기존 "가족에게 결과 보내기"와 **통합**: 같은 동작, 공유로 들어왔을 때만 이름·안내만 바꿈 | 결과 화면의 주 행동은 하나 (senior-ux-korean) |
| 문구 | 기존 §5.6 템플릿 유지 + 두 곳 변경: 둘째 줄을 받는 사람용 `share.verdictLine.*`로, 꼬리를 "※ jjajja로 확인했어요. 자동으로 확인한 결과라 틀릴 수 있어요"로 | 화면 sub("다른 분께 보내기 전에…")는 보내는 사람에게 하는 말이라 메시지에 어색 |
| unknown / 에러 | 다시 보내기 버튼 없음 (unknown은 기존대로 [다시 확인하기], 에러는 S4) | 확인 못 한 영상을 "확인했다"며 퍼뜨리지 않게 |
| 중복 방지 | 처리 직후 `resetShareIntent()`(네이티브 값도 비움) + 같은 값 재진입 무시. `resetOnBackground: true` | 카카오톡으로 다시 보내러 나갔다 돌아와도 같은 영상을 또 확인하지 않음 |
| Expo Go·웹 | 네이티브 모듈 없음 → 훅이 조용히 꺼짐 (웹은 `disabled`) | 기존 8081 웹 시연·Expo Go 흐름 영향 없음 (`expo export --platform web` 확인) |

## 바뀐 문구 (copy.ts, senior-ux-korean 반영)
- `result.reshareButton` 카카오톡 등으로 다시 보내기 / `result.reshareHint` 확인 결과와 영상 링크를 함께 보내요
- `share.verdictLine.likely_ai` 내용을 그대로 믿기 전에 한 번 더 확인해 보세요 / `uncertain` 출처가 확실한 곳에서 같은 내용을 찾아보세요 / `likely_real` 그래도 내용이 사실인지는 따로 확인이 필요해요
- `share.footer` ※ {appName}로 확인했어요. 자동으로 확인한 결과라 틀릴 수 있어요 (붙여넣기 경로의 공유 문구도 같이 바뀜)

메시지 예 (likely_ai, 공유로 들어옴):
```
[jjajja 영상 확인 결과]
AI로 만든 영상일 가능성이 높아요 (AI 가능성 87%)
내용을 그대로 믿기 전에 한 번 더 확인해 보세요
- 유튜브에 'AI로 만든 콘텐츠' 표시가 있어요
영상 주소: https://youtube.com/shorts/abc123?si=XyZ

※ jjajja로 확인했어요. 자동으로 확인한 결과라 틀릴 수 있어요
```

## 검증 (이 환경)
- `npx tsc --noEmit` 통과, `npx jest` 7 suites / 200 tests 통과 (새 `__tests__/share.test.tsx`: 공유 텍스트 처리, 진입 결정, verdict 4종 문구, 버튼 표시, App 공유 진입→결과/에러)
- `npx expo prebuild --no-install --platform android` → manifest에 `ACTION_SEND` + `text/plain` + `DEFAULT` 카테고리, `singleTask`, scheme `jjajja` 확인 후 삭제
- `--platform ios` → `jjajjaAI` 타깃(ShareViewController.swift, Info.plist 활성화 규칙, App Group 엔타이틀먼트) 생성 확인 후 삭제
- prebuild는 `package.json`의 `android`/`ios` 스크립트를 `expo run:*`으로 바꾼다 → 되돌림

## 실기기에서만 확인 가능 (미검증)
- 유튜브 Android/iOS 공유 시트에 jjajja가 보이는지 (iOS는 [더보기]에서 켜야 할 수 있음)
- 카카오톡: 링크 말풍선 공유, 인앱 브라우저 공유 → 카카오 자체 공유 시트가 먼저 뜨는 경우 (platform-constraints.md)
- 카카오톡이 넘기는 텍스트에 링크 외 문장이 섞일 때 서버 `invalid_url`이면 S4 문구가 "다시 붙여넣어 주세요"로 나옴 — 공유 경로에는 어색함. 실제로 자주 생기면 공유 전용 에러 문구 추가 검토 (senior-ux-designer)
- 앱이 이미 결과 화면일 때 새 공유가 오면 새로 확인(이전 요청 취소) — 실기기 동작 확인 필요

## 플랫폼 제약
- Expo Go 불가 → EAS 빌드 필요. iOS는 Apple Developer Program(유료) 필요 (App Group·확장 서명)
- iOS Share Extension은 메모리 한도가 작아 확장 안에서 탐지하지 않고 메인 앱을 연다(라이브러리 기본 동작, `iosHideView: true`로 깜빡임 최소화)
- 영상 파일 자체를 공유받아 업로드 확인하는 것은 이번 범위 밖 (`video/*` 필터 + `uploadVideo` 연결로 확장 가능)
