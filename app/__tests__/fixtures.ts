// 계약 문서(v1.2) 응답 예시 그대로
export const SAMPLE = {
  request_id: 'uuid',
  platform: 'youtube',
  video_id: 'abc123',
  ai_probability: 0.87,
  verdict: 'likely_ai',
  partial: false,
  signals: [
    {
      id: 'platform_ai_label',
      kind: 'rule',
      status: 'ok',
      decisive: true,
      score: 1.0,
      weight: 1.0,
      evidence_ko: "유튜브에 'AI로 만든 콘텐츠' 표시가 있어요",
      via: 'api',
      present: true,
    },
  ],
  cached: false,
  analyzed_at: '2026-09-28T12:00:00Z',
};

// 실제 서버 응답 (v1.2 이전 서버 — present 필드 없음. 구버전 호환 회귀용) (QA 2026-09-28, uvicorn CPU, JJAJJA_FETCH_ENABLED=0) — 계약 v1.1 회귀용.
// URL: 규칙(C2PA) decisive + 영상 확보 불가 → 모델 신호 unavailable, score=null, partial=true
export const SERVER_URL_PARTIAL = {
  "request_id": "0c722c44-9583-4a2d-b6e6-8979f53e2aaa",
  "platform": "youtube",
  "video_id": "jzE0Rcb2hY4",
  "ai_probability": 0.95,
  "verdict": "likely_ai",
  "partial": true,
  "signals": [
    {
      "id": "yt_c2pa_ai_label",
      "kind": "rule",
      "status": "ok",
      "decisive": true,
      "score": 1.0,
      "weight": 1.0,
      "evidence_ko": "영상에 남은 제작 기록에 구글 AI로 만들었다고 나와요",
      "via": "api"
    },
    {
      "id": "yt_self_report_ai",
      "kind": "rule",
      "status": "ok",
      "decisive": false,
      "score": 0.85,
      "weight": 1.5,
      "evidence_ko": "영상 제목에 AI로 만들었다는 표시가 있어요",
      "via": "api"
    },
    {
      "id": "d3",
      "kind": "model",
      "status": "unavailable",
      "decisive": false,
      "score": null,
      "weight": 0.5,
      "evidence_ko": "영상을 받아오지 못해 화면은 확인하지 못했어요",
      "via": "model"
    },
    {
      "id": "commfor_224",
      "kind": "model",
      "status": "unavailable",
      "decisive": false,
      "score": null,
      "weight": 0.5,
      "evidence_ko": "영상을 받아오지 못해 화면은 확인하지 못했어요",
      "via": "model"
    }
  ],
  "cached": true,
  "analyzed_at": "2026-09-28T02:59:28Z"
} as const;

// 업로드: ffmpeg testsrc 6초 720x1280 합성 영상
export const SERVER_UPLOAD = {
  "request_id": "67a4963c-33a6-4b7d-a813-cd112b47a222",
  "platform": "upload",
  "video_id": null,
  "ai_probability": 0.3734,
  "verdict": "likely_real",
  "partial": false,
  "signals": [
    {
      "id": "d3",
      "kind": "model",
      "status": "ok",
      "decisive": false,
      "score": 0.6381,
      "weight": 0.5,
      "evidence_ko": "화면 움직임만으로는 판단하기 어려워요",
      "via": "model"
    },
    {
      "id": "commfor_224",
      "kind": "model",
      "status": "ok",
      "decisive": false,
      "score": 0.1086,
      "weight": 0.5,
      "evidence_ko": "화면 속 장면에서 AI 흔적은 찾지 못했어요",
      "via": "model"
    }
  ],
  "cached": false,
  "analyzed_at": "2026-09-28T03:04:38Z"
};
