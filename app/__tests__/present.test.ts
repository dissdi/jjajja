import { parseDetectResponse, type DetectResponse, type Signal } from '../src/api/contract';
import { copy } from '../src/ux/copy';
import {
  buildShareText,
  detailRowsFor,
  extractUrl,
  headlineFor,
  resultModeFor,
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
  present: null,
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

describe('score=null 신호 (계약 v1.1, QA 회귀)', () => {
  it('정렬이 NaN으로 깨지지 않고 null 점수는 뒤로 간다', () => {
    for (const v of ['likely_ai', 'uncertain', 'likely_real'] as const) {
      const out = selectEvidence(v, [
        sig({ evidence_ko: 'N', score: null }),
        sig({ evidence_ko: 'S', score: v === 'likely_real' ? 0.1 : 0.9 }),
      ]);
      expect(out).toEqual(['S', 'N']);
    }
  });
  it('unavailable 모델 신호(score=null)는 근거에 나오지 않고 partialNoVideo 안내', () => {
    const r = res({
      partial: true,
      signals: [
        sig({ id: 'yt_c2pa_ai_label', decisive: true, score: 1, evidence_ko: '제작 기록' }),
        sig({ id: 'd3', kind: 'model', status: 'unavailable', score: null, evidence_ko: '영상을 받아오지 못했어요', via: 'model' }),
      ],
    });
    expect(selectEvidence('likely_ai', r.signals)).toEqual(['제작 기록']);
    expect(partialNoteFor(r, false)).toBe(copy.result.partialNoVideo);
  });
});

describe('resultModeFor (D1, 명세 §3.1a)', () => {
  it('주소 + unknown + partial → linkOnly, 새 헤드라인·보조 문장, partial 안내 숨김', () => {
    const r = res({ platform: 'youtube', verdict: 'unknown', ai_probability: null, partial: true });
    expect(resultModeFor(r)).toBe('linkOnly');
    expect(headlineFor(r)).toEqual({ headline: copy.result.linkOnly.headline, sub: copy.result.linkOnly.sub });
    expect(headlineFor(r).sub).not.toContain('다시 시도');
    expect(partialNoteFor(r, false)).toBeNull();
  });
  it('platform=unknown(주소 경로)도 linkOnly', () => {
    expect(resultModeFor(res({ platform: 'unknown', verdict: 'unknown', ai_probability: null, partial: true }))).toBe('linkOnly');
  });
  it('업로드 unknown → 기존', () => {
    const r = res({ platform: 'upload', verdict: 'unknown', ai_probability: null, partial: true });
    expect(resultModeFor(r)).toBe('normal');
    expect(headlineFor(r)).toEqual(copy.result.verdict.unknown);
  });
  it('주소 + unknown + partial=false → 기존', () => {
    const r = res({ platform: 'youtube', verdict: 'unknown', ai_probability: null, partial: false });
    expect(resultModeFor(r)).toBe('normal');
    expect(headlineFor(r)).toEqual(copy.result.verdict.unknown);
  });
  it('주소 + likely_ai + partial → 기존 (partialNoVideo 유지)', () => {
    const r = res({ platform: 'youtube', verdict: 'likely_ai', partial: true });
    expect(resultModeFor(r)).toBe('normal');
    expect(headlineFor(r)).toEqual(copy.result.verdict.likely_ai);
    expect(partialNoteFor(r, false)).toBe(copy.result.partialNoVideo);
  });
});


describe('detailRowsFor — 자세히 보기 (§2.3a)', () => {
  const commfor = (o: Partial<Signal> = {}) =>
    sig({ id: 'commfor_224', kind: 'model', via: 'model', present: null, score: 0.05, weight: 0.25,
      evidence_ko: '화면 속 장면에서 AI 흔적은 찾지 못했어요', ...o });
  const d3 = sig({ id: 'd3', kind: 'model', via: 'model', score: 0.5, weight: 0, evidence_ko: '화면 움직임만으로는 판단하기 어려워요' });
  const noLabel = sig({ id: 'yt_no_ai_label', score: 0.5, weight: 0, present: false, evidence_ko: '유튜브에 AI로 만들었다는 표시는 없어요' });
  const creator = sig({ id: 'yt_creator_ai_disclosure', score: 0.95, weight: 3, present: true, evidence_ko: "올린 사람이 유튜브에 'AI로 만든 영상'이라고 밝혔어요" });

  it('모델 ok + weight>0 → 이름, AI 가능성 %, 참고용 경고 (모델 줄이 먼저)', () => {
    const rows = detailRowsFor(res({ verdict: 'uncertain', signals: [noLabel, commfor()] }));
    expect(rows[0]).toMatchObject({
      kind: 'model', name: '화면 속 장면 확인', value: 'AI 가능성 5%',
      detail: '화면 속 장면에서 AI 흔적은 찾지 못했어요', caution: copy.result.details.modelCaution,
    });
    expect(rows[1]).toMatchObject({ kind: 'rule', name: '유튜브 AI 표시', value: '없음' });
  });

  it('가중치 0 모델(d3)은 숨김', () => {
    const rows = detailRowsFor(res({ verdict: 'uncertain', signals: [d3, commfor()] }));
    expect(rows.map((r) => r.key)).toEqual(['commfor_224-1']);
  });

  it('모델 unavailable/error → 확인하지 못했어요 한 줄, 숫자 없음', () => {
    for (const status of ['unavailable', 'error'] as const) {
      const rows = detailRowsFor(res({ verdict: 'likely_ai', signals: [commfor({ status, score: null }), creator] }));
      expect(rows[0]).toEqual({
        key: 'commfor_224-0', kind: 'modelUnavailable', name: '화면 속 장면 확인', value: null,
        detail: copy.result.details.modelUnavailable, caution: null,
      });
    }
  });

  it('규칙 신호에는 숫자가 없다 (있음/없음 + evidence)', () => {
    const selfYes = sig({ id: 'yt_self_report_ai', score: 0.85, present: true, evidence_ko: '영상 제목에 AI로 만들었다는 표시가 있어요' });
    const selfNo = sig({ id: 'yt_self_report_ai', score: 0.5, weight: 0, present: false, evidence_ko: '영상 제목과 설명에 AI 표시는 없어요' });
    const cam = sig({ id: 'yt_c2pa_camera', score: 0.15, present: true, evidence_ko: '영상에 남은 제작 기록에 카메라로 찍었다고 나와요' });
    const rows = detailRowsFor(res({ verdict: 'likely_ai', signals: [creator, selfYes, selfNo, cam] }));
    expect(rows.map((r) => [r.name, r.value])).toEqual([
      ['유튜브 AI 표시', '있음'],
      ['제목·설명의 AI 표시', '있음'],
      ['제목·설명의 AI 표시', '없음'],
      ['카메라 촬영 기록', '있음'],
    ]);
    for (const r of rows) expect(`${r.value} ${r.detail}`).not.toMatch(/\d/);
  });

  describe('규칙 있음/없음은 present로만 결정 (계약 v1.2, #2)', () => {
    const rule = (o: Partial<Signal>) => sig({ id: 'yt_self_report_ai', ...o });
    it.each([
      [true, '있음'],
      [false, '없음'],
    ])('present=%p → %p', (present, value) => {
      const rows = detailRowsFor(res({ signals: [rule({ present, evidence_ko: '근거 문장' })] }));
      expect(rows).toEqual([{ key: 'yt_self_report_ai-0', kind: 'rule', name: '제목·설명의 AI 표시', value, detail: '근거 문장', caution: null }]);
    });

    it('present=null → 있음/없음 없이 evidence만', () => {
      const rows = detailRowsFor(res({ signals: [rule({ present: null, evidence_ko: '영상 제목과 설명에 AI 표시는 없어요' })] }));
      expect(rows).toEqual([{ key: 'yt_self_report_ai-0', kind: 'rule', name: '제목·설명의 AI 표시', value: null,
        detail: '영상 제목과 설명에 AI 표시는 없어요', caution: null }]);
    });

    it('present 필드가 없는 구버전 응답(파서 경유) → evidence만', () => {
      const { present: _omit, ...old } = rule({ evidence_ko: '영상 제목에 AI로 만들었다는 표시가 있어요' });
      const parsed = parseDetectResponse(res({ signals: [old as Signal] }));
      expect(parsed).not.toBeNull();
      const rows = detailRowsFor(parsed!);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ kind: 'rule', value: null, detail: '영상 제목에 AI로 만들었다는 표시가 있어요' });
    });

    it('문장 끝을 해석하지 않는다: "...없어요"로 끝나도 present=true면 있음, "...있어요"여도 present=false면 없음', () => {
      const rows = detailRowsFor(res({ signals: [
        rule({ present: true, evidence_ko: '영상 제목과 설명에 AI 표시는 없어요' }),
        rule({ id: 'yt_c2pa_camera', present: false, evidence_ko: '카메라로 찍었다는 기록이 있어요' }),
      ] }));
      expect(rows.map((r) => r.value)).toEqual(['있음', '없음']);
    });

    it('present.ts 소스에 evidence_ko 문장 끝 파싱이 남아 있지 않다', () => {
      const src = require('fs').readFileSync(require('path').join(__dirname, '../src/ux/present.ts'), 'utf8') as string;
      expect(src).not.toMatch(/없어요/);
      expect(src).not.toMatch(/있어요/);
    });
  });

  it('모르는 id → 이름·값 없이 evidence만', () => {
    const rows = detailRowsFor(res({ signals: [sig({ id: 'tt_new_rule', evidence_ko: '새 규칙 근거' })] }));
    expect(rows).toEqual([{ key: 'tt_new_rule-0', kind: 'rule', name: null, value: null, detail: '새 규칙 근거', caution: null }]);
  });

  it('규칙 unavailable/빈 evidence는 숨김', () => {
    const rows = detailRowsFor(res({ signals: [sig({ status: 'unavailable', score: null, evidence_ko: '' }), sig({ evidence_ko: ' ' })] }));
    expect(rows).toEqual([]);
  });

  it.each([
    [0, 'AI 가능성 1%'],
    [0.004, 'AI 가능성 1%'],
    [0.996, 'AI 가능성 99%'],
    [1, 'AI 가능성 99%'],
  ])('모델 점수 %p → %p (clamp 1~99)', (score, label) => {
    expect(detailRowsFor(res({ signals: [commfor({ score })] }))[0].value).toBe(label);
  });

  it('D1 linkOnly 화면에서는 숨김', () => {
    const r = res({ verdict: 'unknown', ai_probability: null, partial: true,
      signals: [commfor({ status: 'unavailable', score: null }), sig({ status: 'unavailable', score: null, evidence_ko: '' })] });
    expect(resultModeFor(r)).toBe('linkOnly');
    expect(detailRowsFor(r)).toEqual([]);
  });

  it('unknown이어도 모델 ok면 보여줌, 모델 ok 없으면 숨김', () => {
    expect(detailRowsFor(res({ verdict: 'unknown', ai_probability: null, signals: [commfor()] }))).toHaveLength(1);
    expect(detailRowsFor(res({ platform: 'upload', verdict: 'unknown', ai_probability: null, partial: true,
      signals: [commfor({ status: 'error', score: null })] }))).toEqual([]);
  });
});
