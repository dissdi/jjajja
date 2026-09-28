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
      "via": "api | oembed | html | model"
    }
  ],
  "cached": false,
  "analyzed_at": "2026-09-28T12:00:00Z"
}
```

### `GET /v1/health`
`{ "status": "ok", "detectors": { "<id>": "ok|down" } }`

## 필드 규칙

| 필드 | 규칙 |
|------|------|
| `ai_probability` | 0.0~1.0 float. `partial=true`여도 채운다. 계산 불가 시에만 `null` |
| `verdict` | 아래 구간표로 **서버가** 결정. 앱은 확률로 구간을 재계산하지 않는다 (경계값 불일치 방지) |
| `signals[].evidence_ko` | 사용자에게 그대로 보여줄 수 있는 쉬운 한국어. 전문용어 금지 (`senior-ux-korean` 참조) |
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
| 404 | `video_unavailable` | 비공개/삭제/지역 제한 |
| 413 | `file_too_large` | 업로드 한도 초과 |
| 429 | `rate_limited` | 요청 과다 |
| 503 | `detectors_down` | 모든 탐지기 실패 |

## 앱 측 TS 타입 위치
`app/src/api/contract.ts` — 파일 상단에 `// source: .claude/skills/detect-api-contract/SKILL.md (vN)` 주석 필수.

## 변경 이력
| 버전 | 날짜 | 변경 | 사유 |
|------|------|------|------|
| v1 | 2026-09-28 | 초기 계약 | - |
