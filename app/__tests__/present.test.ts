import type { DetectResponse, Signal } from '../src/api/contract';
import { copy } from '../src/ux/copy';
import {
  buildShareText,
  extractUrl,
  looksLikeUrl,
  partialNoteFor,
  percentLabel,
  percentOf,
  selectEvidence,
} from '../src/ux/present';

const sig = (o: Partial<Signal>): Signal => ({
  id: 'x',
  kind: 'rule',
  status: 'ok',
  decisive: false,
  score: 0.5,
  weight: 1,
  evidence_ko: '근거',
  via: 'html',
  ...o,
});

const res = (o: Partial<DetectResponse>): DetectResponse => ({
  request_id: 'r',
  platform: 'youtube',
  video_id: 'abc123',
  ai_probability: 0.87,
  verdict: 'likely_ai',
  partial: false,
  signals: [],
  cached: false,
  analyzed_at: '2026-09-28T12:00:00Z',
  ...o,
});

describe('percent (§3.2)', () => {
  it.each([
    [0, 1],
    [0.004, 1],
    [0.12, 12],
    [0.875, 88],
    [0.996, 99],
    [1, 99],
  ])('%p → %p', (p, pct) => expect(percentOf(p)).toBe(pct));
  it('null → 표시 안 함', () => {
    expect(percentOf(null)).toBeNull();
    expect(percentLabel(null)).toBeNull();
  });
  it('라벨', () => expect(percentLabel(0.87)).toBe('AI 가능성 87%'));
});

describe('selectEvidence (§4)', () => {
  it('status=ok만, 공백 제외, 중복 제거, 최대 3개', () => {
    const out = selectEvidence('likely_ai', [
      sig({ evidence_ko: 'A', score: 0.9 }),
      sig({ evidence_ko: 'B', status: 'error', score: 1 }),
      sig({ evidence_ko: '  ', score: 1 }),
      sig({ evidence_ko: 'A', score: 0.95 }),
      sig({ evidence_ko: 'C', score: 0.8 }),
      sig({ evidence_ko: 'D', score: 0.7 }),
      sig({ evidence_ko: 'E', score: 0.6 }),
    ]);
    expect(out).toEqual(['A', 'C', 'D']);
  });
  it('likely_ai/uncertain: decisive 먼저, 그다음 score×weight', () => {
    const s = [
      sig({ evidence_ko: 'high', score: 0.9, weight: 1 }),
      sig({ evidence_ko: 'decisive', score: 0.5, weight: 0.1, decisive: true }),
      sig({ evidence_ko: 'mid', score: 0.9, weight: 0.5 }),
    ];
    expect(selectEvidence('uncertain', s)).toEqual(['decisive', 'high', 'mid']);
  });
  it('likely_real: (1-score)×weight 내림차순, decisive 무시', () => {
    const s = [
      sig({ evidence_ko: 'aiish', score: 0.9, decisive: true }),
      sig({ evidence_ko: 'clean', score: 0.05 }),
      sig({ evidence_ko: 'meh', score: 0.3 }),
    ];
    expect(selectEvidence('likely_real', s)).toEqual(['clean', 'meh', 'aiish']);
  });
  it('동점이면 서버 순서 유지', () => {
    const s = [sig({ evidence_ko: '1' }), sig({ evidence_ko: '2' }), sig({ evidence_ko: '3' })];
    expect(selectEvidence('likely_ai', s)).toEqual(['1', '2', '3']);
  });
  it('unknown → 근거 없음', () => {
    expect(selectEvidence('unknown', [sig({})])).toEqual([]);
  });
});

describe('partial 안내', () => {
  it('partial=false → 없음', () => expect(partialNoteFor(res({}), false)).toBeNull());
  it('URL + 영상 확인(model) 성공 없음 → partialNoVideo', () => {
    const r = res({ partial: true, signals: [sig({ kind: 'rule' }), sig({ kind: 'model', status: 'unavailable' })] });
    expect(partialNoteFor(r, false)).toBe(copy.result.partialNoVideo);
  });
  it('URL + model ok 있음 → partialNote', () => {
    const r = res({ partial: true, signals: [sig({ kind: 'model', status: 'ok' }), sig({ status: 'error' })] });
    expect(partialNoteFor(r, false)).toBe(copy.result.partialNote);
  });
  it('업로드 → 항상 partialNote', () => {
    expect(partialNoteFor(res({ partial: true }), true)).toBe(copy.result.partialNote);
  });
});

describe('공유 텍스트 (§5.6 완성 예시와 글자 단위 일치)', () => {
  it('likely_ai 예시', () => {
    const r = res({
      signals: [
        sig({ evidence_ko: "유튜브에 'AI로 만든 콘텐츠' 표시가 있어요", decisive: true, score: 1 }),
        sig({ evidence_ko: '사람 얼굴 움직임이 부자연스러워요', kind: 'model', score: 0.8 }),
      ],
    });
    expect(buildShareText(r, 'https://youtube.com/shorts/abc123')).toBe(
      [
        '[jjajja 영상 확인 결과]',
        'AI로 만든 영상일 가능성이 높아요 (AI 가능성 87%)',
        '다른 분께 보내기 전에 한 번 더 생각해 주세요',
        "- 유튜브에 'AI로 만든 콘텐츠' 표시가 있어요",
        '- 사람 얼굴 움직임이 부자연스러워요',
        '영상 주소: https://youtube.com/shorts/abc123',
        '',
        '※ jjajja 앱이 자동으로 확인한 결과라 틀릴 수 있어요',
      ].join('\n'),
    );
  });
  it('likely_real, 근거 없음 예시', () => {
    const r = res({ verdict: 'likely_real', ai_probability: 0.12 });
    expect(buildShareText(r, 'https://youtube.com/shorts/xyz789')).toBe(
      [
        '[jjajja 영상 확인 결과]',
        'AI로 만든 흔적은 찾지 못했어요 (AI 가능성 12%)',
        '그래도 내용이 사실인지는 따로 확인이 필요해요',
        '영상 주소: https://youtube.com/shorts/xyz789',
        '',
        '※ jjajja 앱이 자동으로 확인한 결과라 틀릴 수 있어요',
      ].join('\n'),
    );
  });
  it('확률 null이면 퍼센트 괄호 제거, 업로드면 주소 줄 대체', () => {
    const t = buildShareText(res({ verdict: 'likely_ai', ai_probability: null }), null);
    expect(t).not.toContain('(');
    expect(t).toContain(copy.share.uploadedVideoLine);
    expect(t).not.toContain('{');
  });
});

describe('URL 검증 (§2.1.1: http(s) 형태까지만)', () => {
  it.each([
    'https://youtube.com/shorts/abc123',
    'https://youtu.be/abc123?si=xyz',
    'https://m.youtube.com/shorts/abc123?feature=share',
    'http://www.tiktok.com/@a/video/1',
  ])('%s → URL', (u) => expect(looksLikeUrl(u)).toBe(true));
  it.each(['youtube.com/shorts/abc', '안녕하세요', 'https://', 'ftp://a.com/x', 'https://localhost'])(
    '%s → URL 아님',
    (u) => expect(looksLikeUrl(u)).toBe(false),
  );
  it('공유 문구와 섞인 텍스트에서 주소만 꺼낸다', () => {
    expect(extractUrl('이거 봐요 https://youtube.com/shorts/abc123?si=1 대박')).toBe(
      'https://youtube.com/shorts/abc123?si=1',
    );
    expect(extractUrl('주소 없음')).toBeNull();
    expect(extractUrl('https://')).toBeNull();
  });
  // 서버 인식 도메인 (source-rule-engineer 통지) — 앱이 먼저 거부하면 안 된다
  it.each([
    'https://youtube.com/shorts/abc123',
    'https://www.youtube.com/shorts/abc123',
    'https://m.youtube.com/shorts/abc123',
    'https://music.youtube.com/watch?v=abc123',
    'https://youtu.be/abc123',
    'https://www.youtube-nocookie.com/embed/abc123',
    'youtu.be/abc123',
    'm.youtube.com/shorts/abc123',
  ])('%s → 서버로 그대로 보냄', (u) => expect(extractUrl(u)).toBe(u));
});
