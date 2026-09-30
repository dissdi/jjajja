---
name: detect-api-contract
description: "AI 슬롭 탐지 서버 ↔ 모바일 앱 간 API 계약(요청/응답 스키마, verdict 구간, 에러 코드)의 단일 기준. 탐지 API 응답 필드 추가/변경, 앱의 응답 타입 작성, 서버 엔드포인트 구현, 경계면 QA 시 반드시 이 스킬을 먼저 읽을 것. '응답 형식', '스키마', 'API 필드', '타입 정의' 언급 시에도 사용."
---

# Detect API Contract

서버와 앱이 같은 문서를 보고 구현하도록 만드는 단일 기준이다. 필드를 바꾸려면 **이 파일을 먼저 수정**하고, 변경 이력에 기록한 뒤, 서버·앱을 맞춘다. 순서가 반대면 한쪽이 반드시 어긋난다.

## 엔드포인트 (v1)

### `POST /v1/detect`
URL 또는 업로드 영상 하나를 탐지한다.

요청 (JSON, URL 방식):
```json
{ "url": "https://youtube.com/shorts/abc123", "source": "paste" }
```
- `source`: `"paste" | "share" | "clipboard" | "upload"` — 어떤 진입 경로인지 (분석·통계용, 판정에 영향 없음)

요청 (multipart, 직접 영상): `file` 필드 + `source=upload`
- 한도(v1.1): 파일 **50MB** 이하, 길이 **180초** 이하. 넘으면 413 `file_too_large`. 현재 값은 `GET /v1/health`의 `limits`로도 내려준다 (앱은 업로드 전에 이 값으로 거른다)
- 업로드 응답: `platform: "upload"`, `video_id: null`. 캐시는 파일 sha256 기준

응답 `200`:
```json
{
  "request_id": "uuid",
  "platform": "youtube | tiktok | instagram | unknown | upload",
  "video_id": "abc123 | null",
  "ai_probability": 0.87,
  "verdict": "likely_ai",
  "partial": false,
  "signals": [
    {
      "id": "platform_ai_label",
      "kind": "rule | model",
      "status": "ok | error | unavailable",
      "decisive": true,
      "score": 1.0,
      "weight": 1.0,
      "evidence_ko": "유튜브에 'AI로 만든 콘텐츠' 표시가 있어요",
      "via": "api | oembed | html | model",
      "present": true
    }
  ],
  "cached": false,
  "analyzed_at": "2026-09-28T12:00:00Z"
}
```

### `GET /v1/health`
`{ "status": "ok", "detectors": { "<id>": "ok|down" }, "limits": { "max_upload_mb": 50, "max_duration_s": 180 } }`
- `limits`는 v1.1 추가(선택 필드). 없으면 앱은 기본값 50MB/180초를 쓴다

## 필드 규칙

| 필드 | 규칙 |
|------|------|
| `ai_probability` | 0.0~1.0 float. `partial=true`여도 채운다. 계산 불가 시에만 `null` |
| `verdict` | 아래 구간표로 **서버가** 결정. 앱은 확률로 구간을 재계산하지 않는다 (경계값 불일치 방지) |
| `signals[].evidence_ko` | 사용자에게 그대로 보여줄 수 있는 쉬운 한국어. 전문용어 금지 (`senior-ux-korean` 참조) |
| `partial` | **`true` ⇔ `kind=="model"` 이고 `status=="ok"`인 신호가 하나도 없음** (영상 자체를 보지 못함 — 예: 영상 확보 차단, 모델 전부 실패). 이때도 규칙 신호로 `ai_probability`를 채울 수 있다 (v1.1 명시) |
| `signals[].evidence_ko` (상태별) | `status=="ok"`인 신호는 판정 방향과 무관하게(음성 포함, 모델 포함) 항상 채운다. `unavailable/error`도 가능하면 채운다(예: "영상을 받아오지 못해 화면은 확인하지 못했어요"). 규칙 쪽 `unavailable`은 빈 문자열일 수 있다 |
| `signals[].score` | 0.0~1.0 float 또는 **`null`**. `status`가 `unavailable`/`error`면 `null`(점수 없음). 앱 타입은 `number \| null` (v1.1 명시 — 서버는 v1부터 null을 보냈음) |
| `signals[].weight` | 앙상블에 실제로 쓴 가중치. `0`이면 설명용 신호(가중 평균 제외, 화면 표시는 가능) |
| `signals[].present` | (v1.2) **규칙 신호 전용.** 이 신호가 가리키는 표시·기록을 찾았으면 `true`, 찾아봤는데 없으면 `false`, 확인 못 했으면(`status`≠ok) `null`. 모델 신호는 항상 `null`. 앱의 "있음/없음" 표시는 이 값만 쓴다 — `evidence_ko` 문장을 파싱하지 않는다 (#2) |
| `signals[].decisive` | `true`면 이 신호 하나로 verdict가 결정됨 (예: 공식 AI 라벨, C2PA 생성 기록) |
| 이름 규칙 | JSON은 snake_case. 앱 TS 타입도 snake_case 그대로 쓴다 (변환 레이어로 인한 누락 방지) |

## verdict 구간

| verdict | 조건 | 의미 |
|---------|------|------|
| `likely_ai` | decisive 양성 신호 존재, 또는 p ≥ 0.75 | AI로 만들었을 가능성이 높음 |
| `uncertain` | 0.40 ≤ p < 0.75 | 판단 어려움 |
| `likely_real` | p < 0.40 이고 decisive 양성 없음 | AI 흔적을 찾지 못함 (진짜라는 보증 아님) |
| `unknown` | p = null | 분석 불가 |

구간 경계값은 평가 결과(`detection-qa`)로 조정한다. 조정 시 이 표를 먼저 고친다.

## 에러 응답

`{ "error": { "code": "...", "message_ko": "..." } }`

| HTTP | code | 상황 |
|------|------|------|
| 400 | `invalid_url` | URL 형식 아님 |
| 422 | `unsupported_platform` | 지원하지 않는 사이트 |
| 404 | `video_unavailable` | 비공개/삭제/지역 제한. 단축 링크(bit.ly 등)가 끊겼거나 따라갈 수 없을 때도 (#7) |
| 413 | `file_too_large` | 업로드 한도 초과 |
| 429 | `rate_limited` | 요청 과다 |
| 400 | `invalid_file` | (v1.1) 업로드 파일이 없거나 영상으로 열 수 없음 |
| 503 | `detectors_down` | 모든 탐지기 실패 (업로드 경로에서 모델 신호가 하나도 ok가 아님, 또는 서버 내부 오류) |

## 응답 시간 (v1.2)

| 경로 | 서버 보장 | 앱 제한 시간 |
|------|----------|-------------|
| URL (`POST /v1/detect` JSON) | **40초 이내 응답** (`JJAJJA_URL_BUDGET_S`, 기본 40) | 45초 |
| 업로드 (multipart) | 전송 제외 처리 110초 이내 | 120초 |

서버는 URL 요청의 전체 예산을 넘기지 않는다. 영상 확보·모델이 예산 안에 끝나지 않으면 기다리지 않고 그때까지 모인 신호로 `200 + partial: true`를 준다(끝나지 않은 모델 신호는 `status: "unavailable"`). 서버 예산은 항상 앱 제한 시간보다 짧아야 하며, 바꿀 때 이 표를 먼저 고친다 (#1).

URL 방식에서 영상 확보가 막혀도(봇 차단 등) 에러가 아니라 `200 + partial: true`로 응답한다. 규칙 신호도 없으면 `ai_probability: null, verdict: "unknown"`. 404 `video_unavailable`은 영상이 비공개/삭제/지역 제한으로 확인되고 쓸 수 있는 규칙 신호도 없을 때만 쓴다.

## 앱 측 TS 타입 위치
`app/src/api/contract.ts` — 파일 상단에 `// source: .claude/skills/detect-api-contract/SKILL.md (vN)` 주석 필수.

## 변경 이력
| 버전 | 날짜 | 변경 | 사유 |
|------|------|------|------|
| v1 | 2026-09-28 | 초기 계약 | - |
| v1.1 | 2026-09-28 | (추가만, 기존 필드 불변) 에러 `invalid_file`(400) 추가 / 업로드 한도 50MB·180초 명시 + `/v1/health`에 `limits` 추가 / `partial` 정의 명시(모델 ok 신호 없음) / 상태별 `evidence_ko`·`weight=0` 규칙 명시 | 업로드 경로 구현(detection-engineer), mobile-engineer 요청 (1)(2)(3) |
| v1.2 | 2026-09-28 | (추가만) `signals[].present` 추가(규칙 신호 있음/없음) / 응답 시간 보장 표 추가: URL 40초·업로드 110초 | #2 앱이 문장 끝으로 있음/없음 판단, #1 URL 지연이 앱 45초 초과 가능 |
| v1.1 (QA 보완) | 2026-09-28 | `signals[].score` nullable 명시(필드 규칙 표). 동작 변경 없음 — 서버는 이미 unavailable 신호에 `null`을 보냈고 앱 v1 파서가 이를 거부해 URL partial 결과가 전부 에러 화면이 되던 경계면 버그를 문서로 고정 | qa-integrator (04_qa_report) |
