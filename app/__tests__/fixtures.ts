// 계약 문서(v1) 응답 예시 그대로
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
    },
  ],
  cached: false,
  analyzed_at: '2026-09-28T12:00:00Z',
};
