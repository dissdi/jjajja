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

## 개발 모드 (탐지기 원시 수치 보기)

"API 연결이 안 된 건지, 점수가 낮은 건지"를 구분할 때 쓴다. 기본은 off이며, off일 때 화면은 전혀 바뀌지 않는다.

```sh
# 서버: 신호별 debug.reason / debug.raw 를 응답에 넣는다 (계약 v1.3)
JJAJJA_DEBUG=1 <서버 실행 명령>
# 앱: 결과 화면 [자세히 보기]가 기본 펼침 + 신호별 원시 표
EXPO_PUBLIC_DEBUG=1 npx expo start --web --port 8081 -c
```

- 표 상단: `verdict`, `ai_probability`(소수 넷째), `partial`, `cached`, `request_id`
- 신호마다(가중치 0·unavailable·error 포함, 서버 순서): `id`, `kind`, `status`, `score`(소수 셋째, 없으면 `null`), `weight`, `present`, `decisive`, `reason`(있으면 빨간색), `raw`(key=value 한 줄)
- `reason=-` 이면 서버가 `JJAJJA_DEBUG=1` 없이 떠 있는 것. 예: `status=error reason=http 405: ...` → 연결 문제, `status=ok score=0.041` → 연결은 됐고 점수가 낮은 것
- `EXPO_PUBLIC_*` 는 번들 시점에 들어가므로 값을 바꾸면 `-c`로 다시 시작한다. 코드: `src/debug.ts`, `debugRowsFor`(`src/ux/present.ts`)

## 앱 안 유튜브 시연 (기능 2, 시연용 — 출시 아님)

홈의 **[유튜브 보면서 확인하기 (시연)]** → 앱 안에서 유튜브 모바일 웹(`m.youtube.com/shorts`)이 거의 전체 화면으로 열린다.
쇼츠를 넘기다 한 영상에 0.8초 머무르면 자동으로 `POST /v1/detect`(source `paste`)를 보내고, 오른쪽 위 배지에
"확인 중…" → 신호등 아이콘 + "AI 가능성 93%"가 뜬다. 배지를 누르면 결과 화면(헤드라인·근거·자세히 보기)이 바텀시트로 열리고,
배지를 끌면 자리를 옮길 수 있다. 다시 돌아온 영상은 메모리에 있는 결과를 바로 보여준다(재요청 없음).

**휴대폰(Expo Go)에서만 동작한다.** 웹(`--web`)에서는 "휴대폰 앱에서만 동작해요" 안내만 나온다.

```sh
# 1) 서버를 휴대폰에서 닿는 임시 주소로 연다 (예: 원격 서버에서)
<서버 실행 명령, 0.0.0.0:8000>
npx cloudflared tunnel --url http://localhost:8000   # 또는 ngrok http 8000 → https://xxxx 주소
# 2) 그 주소로 앱을 띄운다 (EXPO_PUBLIC_* 는 번들 시점에 들어가므로 -c)
cd app
EXPO_PUBLIC_API_BASE=https://xxxx.trycloudflare.com npx expo start --tunnel -c
# 3) 휴대폰 Expo Go로 QR 스캔 → 홈 맨 아래 [유튜브 보면서 확인하기 (시연)]
```

- `--tunnel`은 Metro(앱 번들)용 터널이고, 탐지 서버 주소는 별도로 휴대폰에서 닿아야 한다. 메인 작업 폴더의 8081 웹 시연과 겹치지 않게 다른 포트가 필요하면 `--port 8082`.
- 위쪽 막대: [뒤로](유튜브 안에서 뒤로, 더 갈 곳 없으면 앱 홈) · [쇼츠 처음으로] · [나가기]. Android 뒤로가기도 같은 순서(시트 → 유튜브 뒤로 → 앱 홈).

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
App.tsx                  화면 전환 (홈 → 확인 중 → 결과/에러)
src/api/contract.ts      API 계약 타입 (detect-api-contract v1 그대로, snake_case)
src/api/client.ts        detect(url, source) / uploadVideo(file)
src/ux/copy.ts           화면 문구 (UX 명세 §5 키 1:1)
src/ux/theme.ts          색·글자·간격 토큰 (UX 명세 §6)
src/ux/present.ts        퍼센트·근거 선택·공유 문구 규칙 (순수 함수)
src/screens/             Home / Loading / Result / Error / Youtube(.web)
src/youtube/             앱 안 유튜브(시연): 영상 ID 추출, WebView 주입 스크립트, 자동 확인(디바운스·취소·캐시), 배지
__tests__/               jest
```
