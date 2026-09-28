# OS별 진입점 제약 (구현 전 최신 문서로 재확인)

## iOS
- **Share Extension**: 별도 타깃(Swift). 메인 앱과 데이터 공유는 App Group(`group.{bundleId}`) + UserDefaults/파일. 확장 메모리 한도가 작으므로 확장 안에서 탐지하지 말고 URL만 넘긴 뒤 메인 앱을 열거나(딥링크) 서버 호출 결과만 간단히 표시.
- Expo에서는 config plugin으로 타깃 추가 (`expo-share-intent` 또는 커스텀 plugin). EAS Build 필요.
- **클립보드**: iOS 16+는 앱이 다른 앱의 클립보드 내용을 읽을 때 붙여넣기 허용 팝업이 뜬다. 내용 없이 "URL이 있는지"만 확인하는 API(`UIPasteboard.hasURLs` / detectPatterns)는 팝업 없이 가능 → 먼저 확인 후 사용자 동작 시 읽기. `UIPasteControl`(iOS 16+)은 팝업 없는 붙여넣기 버튼.
- 백그라운드 클립보드 감시는 불가.

## Android
- **공유 인텐트**: `AndroidManifest`에 `ACTION_SEND` + `text/plain` intent-filter (config plugin). 유튜브 앱 공유 시 `EXTRA_TEXT`에 URL과 함께 제목 텍스트가 섞여 올 수 있다 → 정규식으로 URL 추출.
- **클립보드**: Android 10+는 포그라운드(또는 기본 IME)만 클립보드 읽기 가능. Android 12+는 읽을 때 토스트 알림 표시.
- 텍스트 선택 메뉴(`PROCESS_TEXT`)로 "jjajja로 확인" 항목 추가 가능 — 복사 대신 선택만으로 진입하는 대안.

## 공통
- 카카오톡 인앱 브라우저에서 연 링크 → 공유 시 카카오 자체 공유 시트가 먼저 뜨는 경우 있음 → 실기기 테스트 필수
- 단축 URL(vt.tiktok.com 등)은 앱이 아니라 서버에서 리다이렉트 해석
