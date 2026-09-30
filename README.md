# jjajja

AI로 만든 쇼츠(AI 슬롭)인지 확인해 주는 모바일 앱.
AI 영상을 구분하기 어려워 단톡방 등에 그대로 공유하는 50~60대 사용자가 **공유 전에 한 번 멈추게** 하는 것이 목표다.

```
유튜브 쇼츠 링크 붙여넣기 ─▶ 탐지 서버 ─▶ "AI로 만든 영상일 가능성이 높아요 (AI 가능성 95%)"
```

## 현재 범위 (1차 MVP)

| 기능 | 상태 |
|------|------|
| 유튜브 쇼츠 URL 붙여넣기 → AI 가능성 | ✅ |
| 영상 파일 직접 올려서 확인 | ✅ |
| 유튜브 자체 AI 표시(C2PA·제작자 공개) 규칙 신호 | ✅ |
| 오픈소스 탐지 모델(Community Forensics) | ⚠️ 동작하지만 판별력 약함 (참고용, 아래 한계 참고) |
| 결과 화면 "자세히 보기" — 모델별 점수 | ✅ |
| 공유하기로 확인 / 복사만 해도 확인 | ⏳ 다음 단계 |
| 틱톡·인스타 릴스 | ⏳ 다음 단계 |

## 구조

```
server/        FastAPI 탐지 서버 (Python)
  rules/       출처별 규칙 — URL 정규화, 유튜브 AI 표시 신호
  detectors/   탐지 모델 어댑터 (d3, commfor_224, mock)
  app/         API, 파이프라인, 앙상블
  config/      앙상블 가중치 (weights.yaml)
app/           Expo(React Native, TypeScript) 앱
eval/          평가용 라벨 데이터셋
.claude/       개발용 에이전트 하네스 (에이전트·스킬 정의)
```

서버와 앱 사이 API 형식은 [`.claude/skills/detect-api-contract/SKILL.md`](.claude/skills/detect-api-contract/SKILL.md)가 단일 기준이다.

## 실행

### 1. 환경 (conda)

```sh
conda env create -f environment.yml   # python 3.11, ffmpeg, nodejs 20
conda activate jjajja
pip install -r server/requirements.txt
```

### 2. 서버

```sh
cd server
uvicorn app.main:app --host 0.0.0.0 --port 8000
curl localhost:8000/v1/health
```

모델 가중치는 첫 실행 때 Hugging Face에서 받는다(약 0.9GB). 기본은 CPU로 돈다. 설정·GPU 사용법은 [`server/README.md`](server/README.md).

### 3-A. 웹으로 시연 (가장 간단)

원격 서버(VS Code Remote)에서 띄우고 PC 브라우저로 본다. 터미널 두 개:

```sh
# 터미널 1: 서버 — 웹 앱(8081)에서 부를 수 있게 CORS를 켠다
conda activate jjajja
cd server
JJAJJA_CORS_ORIGINS=http://localhost:8081 uvicorn app.main:app --host 127.0.0.1 --port 8000

# 터미널 2: 웹 앱
conda activate jjajja
cd app
npm install             # 처음 한 번
# 공용 서버에서는 Metro 캐시를 프로젝트 안에 둔다 (/tmp/metro-cache는 다른 사용자와 공유돼 권한 오류가 난다)
mkdir -p .expo/tmp
TMPDIR=$PWD/.expo/tmp EXPO_PUBLIC_API_BASE=http://localhost:8000 npx expo start --web --port 8081
```

`CI=1`을 붙이지 않는다 — 파일 감시가 꺼져서 코드를 고쳐도 새로고침에 반영되지 않는다.

1. VS Code 아래쪽 **PORTS** 탭에서 **8000**, **8081**을 포워딩한다(자동으로 잡히면 생략).
2. PC 브라우저에서 **http://localhost:8081** 을 연다. 개발자 도구의 모바일 보기(Ctrl+Shift+M)를 켜면 휴대폰 화면처럼 보인다.

시연용 링크:

| 링크 | 예상 결과 |
|---|---|
| `https://youtube.com/shorts/kaVmpWPnE5s` | 🔴 AI 가능성 높음 — 올린 사람이 AI 영상이라고 밝힘 |
| `https://youtube.com/shorts/gfjgRHtDa38` | 🟢 AI 흔적 없음 — 제작 기록에 카메라 촬영 |
| 유튜브 AI 표시가 없는 일반 쇼츠 | 🟡 확실하지 않아요 — 결과 아래 "자세히 보기"에서 모델 점수 확인 |

유튜브가 서버 IP를 봇으로 막으면 영상 다운로드가 실패한다. 그때는 서버를 `JJAJJA_FETCH_ENABLED=0`으로 띄워 유튜브 표시만으로 판정하거나, 앱의 **영상 파일로 확인하기**로 mp4를 올린다. 같은 링크를 반복 요청하지 말 것(결과는 캐시된다).

### 3-B. 휴대폰으로 실행 (Expo Go)

```sh
cd app
npm install
cp .env.example .env    # EXPO_PUBLIC_API_BASE=http://<휴대폰에서 접속 가능한 서버 IP>:8000
npx expo start          # 휴대폰 Expo Go로 QR 스캔
```

서버는 `--host 0.0.0.0`으로 띄우고, 휴대폰이 서버의 8000번 포트에 접속할 수 있어야 한다(같은 와이파이 또는 방화벽 허용). 자세한 내용은 [`app/README.md`](app/README.md).

### 테스트

```sh
cd server && python -m pytest -q     # 네트워크 없이 fixture로 동작
cd app && npx jest && npx tsc --noEmit
```

## 알려진 한계

- **공개 탐지 모델의 판별력이 약하다.** 평가셋 22개(AI 14, 실제 8)로 잰 결과 D3는 AUC 0.44(무작위 수준)라 껐고, Community Forensics는 0.70이지만 신뢰구간이 0.5를 포함해 비중을 낮춰 참고용으로만 쓴다(재현: `server/tools/collect_eval_scores.py`, `server/tools/calibrate_loo.py`). 그래서 유튜브 AI 표시·촬영 기록이 없는 영상은 **최선이 "확실하지 않아요"** 다. 모델만으로 "AI 가능성 높음"이나 "AI 흔적 없음"이 나오지 않도록 막아 두었다.
- **URL 방식은 영상 자체를 못 볼 수 있다.** 플랫폼이 서버의 영상 다운로드를 막으면 유튜브 AI 표시만으로 판정하고, 판단 근거가 없으면 영상 파일로 확인하도록 안내한다.
- **약관 리스크**: URL 방식의 영상 다운로드(yt-dlp)와 유튜브 비공식 API 사용은 연구/프로토타입 용도다. 출시 전 법무 검토가 필요하다.
- 단축 링크(bit.ly, kko.to, naver.me 등)는 서버가 리다이렉트를 따라가 해석한다(#7). 허용 목록(`server/rules/shorturl.py`의 `SHORTENERS`)에 없는 단축 서비스는 인식하지 못한다.

## 로드맵

1. **1차** — 쇼츠 URL 붙여넣기 → AI 가능성 (현재)
2. **base** — 영상 직접 올리기 (구현됨), 탐지 모델 개선(상용 API 비교, ReStraV 학습, 평가셋 100개 이상)
3. **branch** — 배포 환경별 진입점: 공유하기로 확인(iOS Share Extension, Android 공유), 복사 후 앱을 열면 확인 제안
4. 플랫폼 확장 — 틱톡, 인스타 릴스
