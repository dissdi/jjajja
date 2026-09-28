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
| 오픈소스 탐지 모델(D3, Community Forensics) | ✅ 동작, **보정 전** |
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

### 3. 앱

```sh
cd app
npm install
cp .env.example .env    # EXPO_PUBLIC_API_BASE=http://<PC 와이파이 IP>:8000
npx expo start          # 휴대폰 Expo Go로 QR 스캔
```

자세한 내용은 [`app/README.md`](app/README.md).

### 테스트

```sh
cd server && python -m pytest -q     # 네트워크 없이 fixture로 동작
cd app && npx jest && npx tsc --noEmit
```

## 알려진 한계

- **탐지 모델은 아직 보정 전이다.** 최신 생성기(Veo, Sora 등)로 학습된 공개 모델이 없어, `eval/` 데이터셋으로 보정해야 확률을 믿을 수 있다. 보정 전까지 모델 신호만으로는 "가능성 높음"이 나오지 않도록 막아 두었다.
- **URL 방식은 영상 자체를 못 볼 수 있다.** 플랫폼이 서버의 영상 다운로드를 막으면 유튜브 AI 표시만으로 판정하고, 결과 화면에 그 사실을 알린다. 영상 파일 올리기로 모델 판정을 받을 수 있다.
- **약관 리스크**: URL 방식의 영상 다운로드(yt-dlp)와 유튜브 비공식 API 사용은 연구/프로토타입 용도다. 출시 전 법무 검토가 필요하다.
- 카카오톡·bit.ly 단축 링크는 아직 인식하지 못한다.

## 로드맵

1. **1차** — 쇼츠 URL 붙여넣기 → AI 가능성 (현재)
2. **base** — 영상 직접 올리기 (구현됨), 모델 보정
3. **branch** — 배포 환경별 진입점: 공유하기로 확인(iOS Share Extension, Android 공유), 복사 후 앱을 열면 확인 제안
4. 플랫폼 확장 — 틱톡, 인스타 릴스
