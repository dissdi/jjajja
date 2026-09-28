---
name: ai-video-detection
description: "AI 생성 영상(슬롭 쇼츠) 탐지 파이프라인 구현 가이드 — 탐지 API/오픈소스 모델 후보 조사, 어댑터 인터페이스, 영상 확보(URL/업로드), 프레임 샘플링, 점수 앙상블, 캐시. 탐지 API 선정·비교, 탐지기 추가/교체, 확률 계산 로직 수정, 탐지 서버 구현 시 반드시 사용."
---

# AI Video Detection

쇼츠 한 편 → AI 확률 하나를 만드는 서버 파이프라인의 "어떻게"를 정리한다. 응답 형식은 `detect-api-contract`, 플랫폼 규칙은 `source-rules`가 담당한다.

## 파이프라인

```
URL ─▶ normalize(source-rules) ─▶ 캐시 조회 ─hit─▶ 응답
                │                    │miss
                ▼                    ▼
        규칙 신호 추출         영상 확보(yt-dlp 등) / 업로드 파일
                │                    ▼
                │            프레임·오디오 샘플링
                │                    ▼
                │            탐지기 어댑터 병렬 호출
                └────────▶ 앙상블 ◀──┘
                              ▼
                   verdict + signals → 캐시 저장 → 응답
```

## 1. 후보 조사 (detection-researcher)

후보 카탈로그는 `_workspace/01_researcher_catalog.md`에 아래 열로 정리한다:

| 후보 | 유형(상용API/OSS) | 대상(전체합성/얼굴/이미지프레임) | 입력 | 가격·쿼터 | 라이선스 | 근거(독립/벤더주장) | 출처·확인일 |

조사 출발점 (**모두 현재 상태 재확인 필요** — 서비스 종료·정책 변경이 잦다):
- 상용: Hive(AI 생성 콘텐츠 탐지), Sightengine, Reality Defender, Sensity 등
- OSS/연구: TrueMedia.org 공개 코드, GenVideo/DeMamba 계열, AIGVDet, 프레임 단위 이미지 탐지기(UniversalFakeDetect 계열), 얼굴 딥페이크 모델(GenConViT 등 — 전체 합성 쇼츠엔 커버리지 낮음)
- 출처 증명: C2PA Content Credentials (`c2patool`, `c2pa-python`) — 재인코딩되면 메타데이터가 사라지는 경우가 많아 "있으면 결정적, 없으면 무정보"로 다룬다

선정 기준 우선순위: ① 전체 합성 영상 커버리지 ② 오탐률 ③ 비용/쿼터 ④ 지연시간 ⑤ 라이선스.

## 2. 어댑터 인터페이스

모든 탐지기는 같은 인터페이스를 구현한다. 탐지기 교체가 한 파일 추가로 끝나야 "상용 API를 base로" 전략이 유지된다.

```python
class Detector(Protocol):
    id: str                      # signals[].id 로 그대로 노출
    kind: Literal["model"]
    async def detect(self, media: MediaBundle) -> DetectorResult: ...

@dataclass
class MediaBundle:
    video_path: Path | None
    frames: list[Path]           # 균등 샘플 N장 (기본 16)
    audio_path: Path | None
    meta: dict                   # platform, video_id, duration 등

@dataclass
class DetectorResult:
    score: float | None          # 0~1, AI일 확률
    status: Literal["ok","error","unavailable"]
    evidence_ko: str
    raw: dict                    # 원본 응답 (로그용, 클라이언트 비노출)
```

위치: `server/detectors/{id}.py`, 등록은 `server/detectors/__init__.py`의 레지스트리.

## 3. 영상 확보·샘플링
- URL: yt-dlp로 최저 화질 충분(탐지기는 보통 저해상도로 리사이즈). 쇼츠는 60초 내외라 전체 다운로드 비용이 작다.
- **약관 리스크**: 플랫폼 약관상 다운로드가 제한될 수 있다. 연구/프로토타입 단계임을 README에 명시하고, 출시 전 대안(공식 API, 사용자 기기에서 업로드) 검토를 남겨둔다.
- 프레임: ffmpeg로 균등 샘플링. 쇼츠 특유의 자막·스티커 오버레이가 이미지 탐지기를 교란하므로 가능하면 중앙 크롭 버전도 함께 평가한다.

## 4. 앙상블
1. `decisive=true` 양성 규칙 신호가 있으면 p = max(p, 0.95), verdict = `likely_ai`
2. 아니면 status=ok인 신호만으로 가중 평균: `p = Σ(w·s)/Σw`
3. 가중치 초기값은 동일, 이후 `detection-qa` 평가 결과로 조정(로지스틱 회귀 캘리브레이션 권장)
4. ok 신호가 하나도 없으면 p=null, verdict=`unknown`, 503 대신 200 + `partial`로 줄 수 있는지 먼저 검토

가중치는 코드 상수가 아니라 `server/config/weights.yaml`로 분리 — 평가 후 조정이 잦다.

## 5. 캐시·비용
- 키: `(platform, video_id)`; 업로드는 파일 sha256
- TTL: 판정 결과 7일, 탐지기 버전이 바뀌면 무효화 (키에 detector 버전 포함)
- 상용 API 호출 수를 로그로 집계해 무료 쿼터 초과를 사전에 감지

## 6. 로컬 모델과 GPU
오픈소스 모델을 GPU로 돌릴 때는 공용 서버 규칙을 따른다: 실행 전 `nvidia-smi` PID→사용자 매핑으로 소유자 확인, 타인 점유 GPU 금지, 자리가 없으면 보류하고 사용자에게 알린다. `CUDA_VISIBLE_DEVICES`는 확인 후 명시한다.
