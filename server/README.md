# jjajja 탐지 서버 (FastAPI)

AI로 만든 쇼츠인지 확인하는 백엔드. 응답 형식은 **`.claude/skills/detect-api-contract/SKILL.md` (v1.1)** 가 단일 기준이다.

> **약관·법무 리스크 (출시 전 법무 검토 필수)**
> - URL 방식은 `yt-dlp`로 플랫폼 영상을 내려받는다. YouTube·TikTok·Instagram 약관은 다운로드를 제한한다. **연구/프로토타입 용도**로만 둔다.
> - 규칙 신호(`server/rules/`)는 비공식 innertube API·HTML을 읽는다. 사전 고지 없이 바뀌거나 약관 문제가 될 수 있다.
> - 출시 대안: 사용자가 자기 기기에서 영상을 **직접 업로드**(multipart 경로, 이미 구현), 공식 API(YouTube Data API `containsSyntheticMedia`) 검토.
> - 이 서버 IP는 현재 YouTube 봇 차단 상태라 URL 방식의 영상 확보는 **실패가 정상**이다. 그때는 규칙 신호만으로 `partial: true` 응답을 준다. 차단이 감지되면 30분간 yt-dlp를 다시 부르지 않는다(반복 요청 금지).
> - 모델 가중치 라이선스: D3 코드 MIT, XCLIP(microsoft/xclip-base-patch16) MIT(카드 재확인 필요), Community Forensics MIT.

## 설치 (conda env `jjajja`)

```sh
# env 정의: 저장소 루트 environment.yml (python 3.11, ffmpeg, nodejs)
conda env create -f environment.yml          # 이미 있으면 생략
conda run -n jjajja pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128   # GPU 휠(선택)
conda run -n jjajja pip install -r server/requirements.txt
```
ffmpeg/ffprobe는 conda env의 것을 쓴다(`JJAJJA_FFMPEG`로 경로 지정 가능). 모델 가중치는 첫 실행 때 Hugging Face에서 받는다
(`microsoft/xclip-base-patch16` ≈ 0.8GB, `OwensLab/commfor-model-224` ≈ 90MB; `HF_HUB_CACHE` 존중).

## 실행

```sh
cd server
conda run -n jjajja --no-capture-output uvicorn app.main:app --host 0.0.0.0 --port 8000
# 또는 /data2/donginson/conda/envs/jjajja/bin/python -m uvicorn app.main:app --port 8000
```

```sh
curl localhost:8000/v1/health
curl -H 'content-type: application/json' -d '{"url":"https://youtube.com/shorts/jzE0Rcb2hY4","source":"paste"}' localhost:8000/v1/detect
curl -F file=@clip.mp4 -F source=upload localhost:8000/v1/detect
```

### GPU (공용 서버 규칙)
기본은 **CPU**다(D3 ~1초, Community Forensics ~0.2초 / 영상 1편, 64코어 서버 기준). GPU를 쓰려면 먼저 GPU별 소유자를 확인하고,
**다른 사용자 프로세스가 없는 GPU만** `CUDA_VISIBLE_DEVICES`로 지정한다. 지정하지 않으면 `JJAJJA_DEVICE=cuda`여도 CPU로 돈다.

```sh
nvidia-smi --query-compute-apps=gpu_uuid,pid,used_memory --format=csv,noheader | while IFS=, read uuid pid mem; do pid=$(echo $pid | tr -d ' '); idx=$(nvidia-smi --query-gpu=index,gpu_uuid --format=csv,noheader | grep "$uuid" | cut -d, -f1); echo "GPU$idx $(ps -o user= -p $pid) $mem"; done | sort -V
CUDA_VISIBLE_DEVICES=<빈 GPU> JJAJJA_DEVICE=cuda uvicorn app.main:app --port 8000
```

## 설정 (환경변수)
전체 목록은 `app/settings.py` 상단 표. 자주 쓰는 것:

| env | 기본 | 설명 |
|---|---|---|
| `JJAJJA_DETECTORS` | `d3,commfor_224` | 로드할 모델 탐지기 |
| `JJAJJA_ENABLE_MOCK` / `JJAJJA_MOCK_SCORE` | `0` / - | 테스트용 `mock` 탐지기 |
| `JJAJJA_MAX_UPLOAD_MB` | `50` | 업로드 한도(413). 길이 한도 180초는 계약 고정값 |
| `JJAJJA_FETCH_ENABLED` | `1` | `0`이면 yt-dlp를 아예 부르지 않음 |
| `JJAJJA_RATE_LIMIT_PER_MIN` | `30` | IP당 분당 요청(429) |
| `JJAJJA_CACHE_DIR` | `server/.cache` | 결과 캐시(7일, partial 6시간) |
| `JJAJJA_CORS_ORIGINS` | (꺼짐) | 웹 시연용 브라우저 origin, 예: `http://localhost:8081` |

API 키가 필요한 탐지기(상용)는 키를 **환경변수로만** 받는다. 현재 1차 MVP에는 상용 API가 없다(무료 OSS 우선).

## 구조
```
app/        main.py(엔드포인트) pipeline.py ensemble.py cache.py schemas.py(계약 pydantic) errors.py settings.py
detectors/  base.py(어댑터 인터페이스) __init__.py(레지스트리) mock.py d3.py commfor.py
media/      fetch.py(yt-dlp, 차단 시 쿨다운) ffmpeg.py(프로브·프레임 샘플링)
config/weights.yaml   앙상블 가중치·구간·캘리브레이션 (코드 상수 아님)
rules/      출처별 규칙 (source-rule-engineer 담당)
tools/score_file.py   로컬 영상의 탐지기 원점수 출력 (QA 캘리브레이션용)
```
탐지기 추가 = `detectors/<id>.py` + `detectors/__init__.py`의 `FACTORIES` 한 줄 + `weights.yaml` 항목.

## 테스트
```sh
cd server
conda run -n jjajja python -m pytest -q                       # 계약·앙상블·미디어·규칙 통합 (네트워크 없음)
JJAJJA_TEST_MODELS=1 conda run -n jjajja python -m pytest -q tests/test_models.py   # 실제 모델 (CPU)
```
테스트 영상은 ffmpeg로 합성한다(`*.mp4`는 gitignore). YouTube에는 요청하지 않는다(규칙 쪽은 innertube fixture).

## 캘리브레이션
```sh
conda run -n jjajja python -m tools.score_file a.mp4 b.mp4 --json > scores.jsonl
```
원점수(`d3.raw.d2_std`, `commfor_224.raw.mean/top25`)로 Platt 회귀를 맞춘 뒤 `weights.yaml`의 `calibration: {a, b}`와
`calibrated: true`를 채운다. `calibrated: true`인 모델은 단독으로 `likely_ai`를 낼 수 있는 "강한 신호"가 된다.
