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

## 검증

```sh
npx tsc --noEmit        # 타입 검사
npx jest                # 단위/화면 테스트 (계약 파싱, 에러 코드→문구 매핑, 결과 표시 규칙, 화면 흐름)
npx expo export --platform web   # 번들 확인
```

## 복사 후 앱을 열면 확인 안내 (#12)

앱을 열 때·다시 앞으로 올 때 클립보드를 **내용은 읽지 않고** 확인해, 복사한 내용이 있으면 [붙여넣기] 버튼 위에 안내 한 줄을 띄운다.
내용은 사용자가 버튼을 누를 때만 읽는다(그때 요청 `source`는 `clipboard`, 안내가 없으면 `paste`).

| OS | 확인 방법 | 팝업·알림 | 한계 |
|----|----------|----------|------|
| iOS | `hasUrlAsync` (UIPasteboard.hasURLs) | 없음 | 카카오톡 메시지 글처럼 "글 속의 주소"는 URL 항목이 아니라 안내가 안 뜰 수 있음 (버튼은 그대로 동작) |
| Android | `hasStringAsync` (ClipDescription) | 없음 | 주소인지 모름 → 아무 글이나 복사돼 있어도 안내("영상 주소라면…") |
| 웹 | 확인 안 함 | — | 브라우저가 권한을 물어서 |

한 번 확인을 시작하면 앱이 다시 앞으로 올 때까지 안내를 띄우지 않는다(방금 확인한 주소가 클립보드에 남아 있어도 반복 안 함).
실기기 동작은 #11에서 확인한다.

## 구조

```
App.tsx                  화면 전환 (홈 → 확인 중 → 결과/에러)
src/capture/clipboard.ts 클립보드에 복사한 내용이 있을 법한지 (내용은 읽지 않음, #12)
src/api/contract.ts      API 계약 타입 (detect-api-contract v1 그대로, snake_case)
src/api/client.ts        detect(url, source) / uploadVideo(file)
src/ux/copy.ts           화면 문구 (UX 명세 §5 키 1:1)
src/ux/theme.ts          색·글자·간격 토큰 (UX 명세 §6)
src/ux/present.ts        퍼센트·근거 선택·공유 문구 규칙 (순수 함수)
src/screens/             Home / Loading / Result / Error
__tests__/               jest
```
