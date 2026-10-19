# jjajja 앱 (Expo, TypeScript)

유튜브 쇼츠 주소를 붙여넣거나, 휴대폰에 저장된 영상을 골라서 AI로 만든 영상인지 확인하는 앱 (1차 MVP).

## 준비 (conda 기준)

```sh
cd /data2/donginson/projects/jjajja
conda env create -f environment.yml   # 처음 한 번 (nodejs=20 포함)
conda activate jjajja
cd app
npm install
```

## 서버 주소 설정

앱은 `EXPO_PUBLIC_API_BASE` 환경변수로 탐지 서버에 접속한다 (없으면 `http://localhost:8000`).
휴대폰(Expo Go)에서 `localhost`는 휴대폰 자신을 가리키므로 **PC의 같은 와이파이 IP**를 넣어야 한다.

```sh
cp .env.example .env          # .env 는 gitignore 됨
# .env 편집: EXPO_PUBLIC_API_BASE=http://192.168.0.10:8000
```

값을 바꾸면 `npx expo start -c`(캐시 비우기)로 다시 시작한다. 서버는 `0.0.0.0`으로 떠 있어야 휴대폰에서 접근된다.

## 실행

```sh
npx expo start          # QR 코드 → 휴대폰 Expo Go 앱으로 스캔
npx expo start --web    # 브라우저에서 빠르게 확인
```

- 휴대폰과 PC가 다른 네트워크면 `npx expo start --tunnel`. 이때도 **서버 주소는 휴대폰에서 닿는 주소**여야 한다.
- 원격 서버(SSH)에서 개발 중이면: 서버 포트를 휴대폰이 닿는 곳으로 노출하거나(예: `ngrok http 8000` 후 그 https 주소를 `EXPO_PUBLIC_API_BASE`로), `--tunnel`로 Metro를 연다.

## 로그인 (계약 v2.0 — 로그인 필수, GitHub #20)

`/v1/health`·`/v1/auth/*`을 뺀 모든 요청에 `Authorization: Bearer <token>`을 붙인다(`src/api/client.ts`). 서버도 v2.0(인증) 이어야 한다.

- **첫 화면**: 저장된 토큰이 없으면 로그인. [처음이에요, 가입할게요] → 회원가입(이메일·비밀번호 8자 이상·비밀번호 한 번 더). 가입·로그인 요청에 `device_name`("Android 앱 (Pixel 8)", "iPhone 앱", "웹 브라우저")을 보낸다.
- **토큰 저장**: 휴대폰은 `expo-secure-store`(Expo Go에서도 동작), 웹은 `localStorage`(막히면 메모리). `src/auth/tokenStore.ts`, `src/auth/session.ts`.
- **401**: 토큰을 지우고 로그인 화면("로그인이 풀렸어요")으로. 확인 중이던 주소·공유 문구·영상은 로그인 후 자동으로 이어서 확인한다.
- **공유로 들어왔는데 로그인 전**: 로그인 화면에 "로그인하면 보내 주신 영상을 바로 확인해 드려요" → 로그인 직후 그 공유를 확인.
- **내 기록**(홈 오른쪽 위): `GET /v1/history` 무한 스크롤(`before` 커서) → 항목 탭 → 결과 요약(판정 블록·확인한 때·기기·주소) → [이 영상 다시 확인하기] / [이 기록 지우기](확인 후 `DELETE`, 404 `not_found`는 이미 지워진 것으로 처리).
- **내 계정**: 로그인한 이메일, 로그인된 기기 목록(`GET /v1/me`, 이 기기 표시), [로그아웃](`POST /v1/auth/logout` 후 기기에서도 삭제).
- 앱 안 유튜브 자동 확인도 같은 토큰을 쓴다.
- 에러 code → 문구: `copy.auth.error` (invalid_credentials, email_taken, invalid_email, weak_password, unauthorized, not_found + 네트워크).

## 디자인 (잉크 & 크림 v2 정제·에디토리얼, GitHub #21)

기준: `.claude/skills/senior-ux-korean/references/design-system.md`, 토큰 원본 `../design/tokens.json`. 라이트 모드만.

- `src/ux/theme.ts`는 `src/ux/tokens.json`(= `design/tokens.json` 복사본)에서 값을 가져온다. 색·크기 숫자를 코드에 적지 않는다. 토큰이 바뀌면 `npm run tokens`로 다시 복사 — 어긋나면 `__tests__/theme.test.ts`가 실패한다(색 hex·그림자 사용도 검사).
- 글꼴(SIL OFL 1.1, `assets/fonts/OFL.txt`): Pretendard Regular/SemiBold/Bold(본문·버튼), Noto Serif KR SemiBold(큰 제목 600: 홈·확인 중·로그인·에러 제목)·Bold(판정 헤드라인 700 전용). 명조는 24pt 이상, copy.ts 고정 문구 전용. 두 명조 모두 KS X 1001 한글 2,350자 + ASCII + 기호 + copy.ts 글자로 서브셋(각 약 1.1MB): `python scripts/subset_serif.py <원본 NotoSerifKR-Bold.otf 또는 NotoSerifKR-SemiBold.otf>` (fonttools 필요). **copy.ts에 새 명조 문구를 넣으면 두 서브셋을 다시 만든다.**
- `expo-font`로 불러오고 그동안 스플래시를 유지한다(최대 4초, 실패하면 시스템 글꼴). 로드 전에는 `T`/`Input`이 시스템 글꼴 + 굵기로 대신 그린다.
- v2 원칙(실기기 피드백 "버튼이 너무 커, 굵어서 싸 보임"): 접근성은 터치 영역(hitSlop)과 본문 18로 지키고, 보이는 무게는 줄인다.
  - 버튼: 주 버튼 보이는 높이 48·내용 폭(최대 400)·17/600·모서리 8, **화면당 하나**. 두 번째 행동은 1px `lineUi` 선 버튼(44, hitSlop 4 → 터치 52), 그다음은 밑줄 텍스트 버튼(44, 터치 52). 아이콘 버튼은 상자 40 + hitSlop 8.
  - 선: 1px 헤어라인이 기본. 카드 외곽선 없음(목록은 행 + 1px `line`). 입력칸·선 버튼 경계만 `lineUi`. 2px는 유튜브 배지와 개발 영역만.
  - 판정 블록: 색 면·왼쪽 띠 없이 위 1px 판정색 선 + 도장 40(1.5px) + 명조 700 헤드라인. 700 굵기는 이 헤드라인 하나뿐.
  - 여백: 좌우 24, 섹션 40, 판정 블록 위아래 24, 간격 단계 4·8·12·16·20·24·32·48·64.
- 부품(`src/components/ui.tsx`): 주/선/텍스트/아이콘 버튼, 입력칸, 판정 블록·도장, 화면 제목·에러 제목 묶음, 안내 줄, 잉크 번짐 로딩(유일한 애니메이션, 동작 줄이기 설정이면 정지), DEV 띠·칩. 개발 영역 표는 `src/screens/DebugTable.tsx`.
- 앱 안 유튜브 배지는 불투명 크림 면 + 2px 잉크 테두리(높이 40), 바텀시트는 크림 면 + 윗모서리 16(윗선 없음). 그림자 없음.
- Do/Don't는 `__tests__/designRules.test.tsx`가 지킨다: 버튼 높이·hitSlop·폭, 화면당 주 버튼 1개, `fontWeight 700` 하드코딩 금지, `font.headline`은 판정 블록만, 2px 선·`lineStrong`·판정 `tint` 사용처 제한.

## 개발 모드 (탐지기 원시 수치 보기)

"API 연결이 안 된 건지, 점수가 낮은 건지"를 구분할 때 쓴다. 기본은 off이며, off일 때 화면은 전혀 바뀌지 않는다.

```sh
# 서버: 신호별 debug.reason / debug.raw 를 응답에 넣는다 (계약 v1.3)
JJAJJA_DEBUG=1 <서버 실행 명령>
# 앱: 결과 화면 [자세히 보기]가 기본 펼침 + 신호별 원시 표
EXPO_PUBLIC_DEBUG=1 npx expo start --web --port 8081 -c
```

- 개발 모드가 켜지면 모든 화면 맨 위에 남색 DEV 띠(`DEV · api {host} · v2.0`), 결과 화면 아래에 DEV 영역(고정폭 숫자, 신호별 기여도 막대 `weight·score ÷ Σweight`, OK/FAIL/SKIP 칩)
- 표 상단: `verdict`, `ai_probability`(소수 넷째), `partial`, `cached`, `request_id`
- 신호마다(가중치 0·unavailable·error 포함, 서버 순서): `id`, `kind`, `status`, `score`(소수 셋째, 없으면 `null`), `weight`, `present`, `decisive`, `reason`(있으면 빨간색), `raw`(key=value 한 줄)
- `reason=-` 이면 서버가 `JJAJJA_DEBUG=1` 없이 떠 있는 것. 예: `status=error reason=http 405: ...` → 연결 문제, `status=ok score=0.041` → 연결은 됐고 점수가 낮은 것
- `EXPO_PUBLIC_*` 는 번들 시점에 들어가므로 값을 바꾸면 `-c`로 다시 시작한다. 코드: `src/debug.ts`, `src/ux/debugView.ts`

## 공유하기로 확인 (GitHub #12 기능 3)

유튜브·카카오톡에서 [공유] → 목록의 **jjajja**(iOS 표시 이름 `jjajja AI 확인`) → 바로 "확인하고 있어요" → 결과 → [카카오톡 등으로 다시 보내기]로 **결과 문구 + 원래 링크**를 OS 공유 시트로 다시 보낸다.

- 받은 공유 문구(제목+주소, 카카오 단축 링크 등)는 **그대로** `POST /v1/detect`에 `source: "share"`로 보낸다. 주소 추출·단축 링크 해석은 서버가 한다.
- 네이티브 설정은 `expo-share-intent`(v8, Expo SDK 57용) config plugin이 prebuild 때 만든다 (`app.json` → `plugins`). `ios/`·`android/`는 만들어지는 산출물이라 커밋하지 않는다(gitignore).
  - Android: `MainActivity`에 `ACTION_SEND` + `text/plain` intent-filter, `launchMode=singleTask`
  - iOS: Share Extension 타깃 `jjajjaAI`(Swift) + App Group `group.com.jjajja.app` + URL scheme `jjajja`
- **Expo Go와 웹에서는 동작하지 않는다**(네이티브 모듈 없음 → 조용히 꺼지고 붙여넣기 흐름은 그대로). 시연하려면 EAS로 앱을 직접 빌드해야 한다.

### 필요한 계정
| 플랫폼 | 계정 | 비고 |
|--------|------|------|
| Android | Expo 계정 (무료) | APK를 받아 휴대폰에 바로 설치 |
| iOS | Expo 계정 + **Apple Developer Program**(유료, 연 $99) | Share Extension·App Group은 서명이 필요해 무료 계정으로는 안 됨. 실기기 UDID 등록 필요 |

### 빌드·시연 (사용자가 직접)
```sh
npm install -g eas-cli          # 또는 npx eas-cli
eas login                       # Expo 계정
eas init                        # app.json에 projectId 추가 (커밋)
eas build:configure             # eas.json 생성 (커밋)
```
- `eas.json`의 빌드 프로필 `env`에 `EXPO_PUBLIC_API_BASE`(휴대폰에서 닿는 서버 주소, 예: ngrok https 주소)를 넣는다. 번들에 빌드 시점 값이 들어간다.
- Android (가장 빠름): 프로필에 `"android": { "buildType": "apk" }`, `"distribution": "internal"` 후 `eas build -p android --profile preview` → 링크/QR로 APK 설치.
- iOS: `eas device:create`로 기기 등록 → `eas build -p ios --profile preview`. 자격 증명 단계에서 **확장 타깃이 하나(`jjajjaAI`)만** 잡혀야 한다(expo-share-intent FAQ). EAS가 `app.json`에 실험용 `appExtensions`를 자동으로 넣지 않도록 `eas init`/`eas.json`을 먼저 만든다.
- 코드 수정을 바로 보며 개발하려면 dev client: `npx expo install expo-dev-client` 후 `"developmentClient": true` 프로필로 빌드 → `npx expo start --dev-client`.
- 로컬에 Android Studio/Xcode가 있으면 `npx expo prebuild --clean && npx expo run:android`(또는 `run:ios`)도 된다. 만들어진 `android/`·`ios/`는 커밋하지 않는다.

시연 순서: 유튜브 앱에서 쇼츠 → [공유] → (목록 끝 [더보기]에서) jjajja → 결과 → [카카오톡 등으로 다시 보내기] → 카카오톡 선택. 카카오톡에서 받은 링크는 말풍선 길게 누르기 → [공유], 또는 링크를 연 화면의 공유 버튼 → 다른 앱 → jjajja (카카오톡 버전·기종마다 메뉴 위치가 달라 실기기 확인 필요). 실기기 확인 항목은 `NOTES-share.md`.

설정만 검증할 때 (빌드 없이): `npx expo prebuild --no-install --platform android` → `android/app/src/main/AndroidManifest.xml`에 `android.intent.action.SEND` 확인 → `rm -rf android` (prebuild가 `package.json`의 `android`/`ios` 스크립트를 `expo run:*`으로 바꾸므로 되돌린다).

## 앱 안 유튜브 시연 (기능 2, 시연용 — 출시 아님)

홈의 **[유튜브 보면서 확인하기 (시연)]** → 앱 안에서 유튜브 모바일 웹(`m.youtube.com/shorts`)이 거의 전체 화면으로 열린다.
쇼츠를 넘기다 한 영상에 0.8초 머무르면 자동으로 `POST /v1/detect`(source `paste`)를 보내고, 오른쪽 위 배지에
"확인 중…" → 신호등 아이콘 + "AI 가능성 93%"가 뜬다. 배지를 누르면 결과 화면(헤드라인·근거·자세히 보기)이 바텀시트로 열리고,
배지를 끌면 자리를 옮길 수 있다. 다시 돌아온 영상은 메모리에 있는 결과를 바로 보여준다(재요청 없음).
위쪽 막대는 없다(유튜브가 전체 화면). 배지는 영상이 아닌 화면에서도 "쇼츠를 열면 확인해요"로 늘 떠 있고, 누르면 시트 아래에
[뒤로] · [쇼츠 처음으로] · [나가기] 선 버튼이 있다.

**휴대폰(Expo Go)에서만 동작한다.** 웹(`--web`)에서는 "휴대폰 앱에서만 동작해요" 안내만 나온다.

실행 절차(탐지 서버 터널 + `expo start --tunnel`, 도구 설치, QR, 주의 사항)는 **루트 [`README.md`](../README.md)의 "3-B. 휴대폰으로 시연"**에 실제로 시연한 순서대로 정리돼 있다.

- `--tunnel`은 Metro(앱 번들)용 터널이고, 탐지 서버 주소는 별도로 휴대폰에서 닿아야 한다. 메인 작업 폴더의 8081 웹 시연과 겹치지 않게 다른 포트가 필요하면 `--port 8082`.
- 화면 이동은 배지 → 시트 아래 버튼: [뒤로](유튜브 안에서 뒤로, 더 갈 곳 없으면 앱 홈) · [쇼츠 처음으로] · [나가기](앱 홈). Android 뒤로가기는 시트 → 유튜브 뒤로 → 앱 홈 순서.

**알려진 한계 (시연용)**
- 구글 로그인 불가: 구글은 WebView 안 로그인을 막는다. 로그인 없이 보는 쇼츠만 된다.
- 유튜브가 WebView 재생을 막거나 봇 확인("로봇이 아닙니다")을 띄울 수 있다. 시연용으로 UA를 일반 브라우저처럼 바꿔 두었지만 보장되지 않는다.
- 영상마다 서버가 영상을 내려받아 확인하므로, 많이 넘기면 서버 IP가 유튜브에 차단될 수 있다(0.8초 머무름·캐시로 줄였을 뿐 없애지 못함).
- 유튜브 화면을 감싸 다시 보여주는 방식이라 스토어 정책(유튜브 약관)상 출시할 수 없다. 시연 전용.
- 자세한 내용: `NOTES-in-app-youtube.md`

## 검증

```sh
npx tsc --noEmit        # 타입 검사
npx jest                # 단위/화면 테스트 (계약 파싱, 에러 코드→문구 매핑, 결과 표시 규칙, 화면 흐름)
npx expo export --platform web   # 번들 확인
```

## 구조

```
App.tsx                  화면 전환 (로그인/가입 → 홈 → 확인 중 → 결과/에러, 내 기록, 내 계정)
src/api/contract.ts      API 계약 타입 (detect-api-contract v2.0 그대로, snake_case)
src/api/client.ts        detect / uploadVideo / signup / login / logout / getMe / getHistory / deleteHistory (Bearer, 401 처리)
src/auth/                토큰 저장(secure-store·웹 localStorage), 세션, device_name
src/ux/copy.ts           화면 문구 (UX 명세 §5 키 1:1)
src/ux/theme.ts          디자인 토큰 (tokens.json에서 생성) + 글꼴 매핑
assets/fonts/            Pretendard·Noto Serif KR(서브셋) + OFL.txt
scripts/                 sync-tokens.js(토큰 복사), subset_serif.py(명조 서브셋)
src/ux/present.ts        퍼센트·근거 선택·공유 문구 규칙 (순수 함수)
src/capture/share.ts     공유하기로 받은 텍스트 처리·진입 결정 (순수 함수)
src/capture/useShareEntry.ts  공유 수신 훅 (expo-share-intent)
src/screens/             Auth(로그인·가입) / Home / Loading / Result / Error / History / Account / Youtube(.web)
src/youtube/             앱 안 유튜브(시연): 영상 ID 추출, WebView 주입 스크립트, 자동 확인(디바운스·취소·캐시), 배지
__tests__/               jest
```
