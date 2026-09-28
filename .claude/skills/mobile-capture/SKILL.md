---
name: mobile-capture
description: "jjajja 모바일 앱(Expo React Native + iOS Swift 확장)에서 쇼츠 링크를 받아들이는 모든 경로의 구현 가이드 — URL 붙여넣기(base), 공유하기로 탐지(iOS Share Extension, Android 공유 인텐트), 복사만 해도 탐지(클립보드 확인), 직접 영상 업로드. 앱 화면 구현, 공유 시트 연동, 클립보드 감지, Expo prebuild/config plugin, Swift 네이티브 작업 시 반드시 사용."
---

# Mobile Capture

링크가 앱에 들어오는 경로(진입점)별 구현법. 어떤 경로로 들어와도 결국 `POST /v1/detect`(`detect-api-contract`) 한 번으로 모인다 — 진입점만 다르고 결과 화면은 하나다.

## 앱 구조 (Expo, TypeScript)

```
app/
├── app.config.ts            # config plugin 등록 (share extension, intent filter)
├── src/
│   ├── api/contract.ts      # detect-api-contract 그대로 (snake_case)
│   ├── api/client.ts        # detect(url, source) / upload(file)
│   ├── capture/             # 진입점별 → 공통 enqueue(url, source)
│   │   ├── paste.ts
│   │   ├── share.ts
│   │   └── clipboard.ts
│   ├── screens/  Home / Result / Error
│   └── ux/copy.ts           # UX 명세 문구 (senior-ux-korean)
└── plugins/                 # 커스텀 config plugin (Swift 확장 등)
```

`ios/`, `android/`는 prebuild 산출물로 취급하고 직접 편집하지 않는다. 네이티브 변경은 config plugin 또는 `plugins/` 내 Swift/Kotlin 소스 복사 방식으로.

## 진입점별 구현

| 진입점 | source | 단계 | 방법 | 난이도 |
|--------|--------|------|------|-------|
| URL 붙여넣기 | `paste` | **1차 (base)** | 큰 입력칸 + "붙여넣기" 버튼(`expo-clipboard`) + "확인하기" | 낮음 |
| 직접 영상 넣기 | `upload` | base | `expo-image-picker`/`expo-document-picker` → multipart | 낮음 |
| 공유하기 | `share` | branch | iOS: Share Extension(Swift) / Android: `ACTION_SEND` intent filter. 후보 라이브러리 `expo-share-intent` — 버전 호환은 설치 시 확인 | 중간 |
| 복사만 해도 | `clipboard` | branch | 아래 제약 참고 | 중간 |

세부 구현과 OS별 제약은 `references/platform-constraints.md` 참조 (공유/클립보드 작업 시 읽을 것).

## "복사만 해도 탐지"의 현실적 설계
두 OS 모두 백그라운드에서 클립보드를 몰래 읽는 것을 막는다. 따라서:
1. 앱이 포그라운드로 올 때(`AppState` → `active`) 클립보드에 **URL이 있는지만** 먼저 확인 (iOS는 `hasUrlAsync` 류로 내용 없이 확인 가능한지 검토 → 붙여넣기 권한 팝업 최소화)
2. 지원 플랫폼 링크면 "방금 복사한 영상, 확인해볼까요?" 카드 표시 → 사용자가 누르면 읽고 탐지
3. 같은 링크를 반복 제안하지 않도록 마지막 제안 URL 해시 저장

진짜 "복사 즉시" 동작(앱을 열지 않아도)은 불가하거나 매우 제한적이다. 이 한계를 기획 측에 명확히 보고한다. 대안: 홈 화면 위젯/단축어(iOS Shortcuts), Android 빠른 설정 타일 — 후속 검토 항목.

## 결과 화면 연결
- `verdict` → UX 명세의 표현 (앱에서 확률로 구간 재계산 금지)
- `signals[].evidence_ko` 중 status=ok 상위 2~3개만 표시
- 에러 `code` → `ux/copy.ts`의 에러 문구 매핑. 매핑 누락 코드는 기본 문구로 폴백

## 테스트
- 붙여넣기: youtube.com/shorts, youtu.be, m.youtube.com, 추적 파라미터 포함 URL
- 공유: 실제 유튜브/카카오톡 앱에서 공유 → 앱 수신 확인 (시뮬레이터 + 실기기)
- Expo Go에서는 share extension이 동작하지 않는다 → development build 필요
