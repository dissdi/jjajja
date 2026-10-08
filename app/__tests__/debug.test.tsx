// 개발 모드 원시 표 (계약 v1.3 signals[].debug, EXPO_PUBLIC_DEBUG=1)
import { fireEvent, render, screen } from '@testing-library/react-native';
import { parseDetectResponse, type DetectResponse, type Signal } from '../src/api/contract';
import { ResultScreen } from '../src/screens/ResultScreen';
import { copy } from '../src/ux/copy';
import { detailRowsFor } from '../src/ux/present';
import { DEBUG_GLOSSARY, debugCalcFor, debugGroupsFor, debugSummaryFor, rawLinesFor } from '../src/ux/debugView';
import { SAMPLE, SERVER_URL_PARTIAL } from './fixtures';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

const sig = (o: Partial<Signal>): Signal => ({
  id: 'x', kind: 'model', status: 'ok', decisive: false, score: 0.5, weight: 1,
  evidence_ko: '근거', via: 'model', present: null, ...o,
});
const res = (o: Partial<DetectResponse>): DetectResponse => ({ ...(SAMPLE as DetectResponse), ...o });
const noop = () => {};

const hive = sig({ id: 'hive', status: 'error', score: null, weight: 0.5,
  debug: { reason: 'http 405: Organization paused', raw: null } });
const d3 = sig({ id: 'd3', score: 0.12345, weight: 0, debug: { reason: 'weight 0 (disabled)', raw: { mean: 0.98, top25: 1, frames: 20 } } });
const commfor = sig({ id: 'commfor_224', score: 0.0412, weight: 0.25 });
const rule = sig({ id: 'yt_ai_label', kind: 'rule', via: 'html', score: 0.5, weight: 1, present: false, decisive: true });

describe('계약 v1.3 signals[].debug 파싱', () => {
  const base = (SAMPLE as { signals: object[] }).signals[0];
  it('debug 없음 → undefined (정상 파싱, 기존 결과와 동일)', () => {
    const r = parseDetectResponse(SAMPLE);
    expect(r).not.toBeNull();
    expect(r!.signals.every((s) => s.debug === undefined)).toBe(true);
    expect(r).toEqual(SAMPLE);
  });
  it('debug 있음 → 그대로', () => {
    const debug = { reason: 'timeout after 25.0s', raw: { mean: 0.98 } };
    const r = parseDetectResponse({ ...SAMPLE, signals: [{ ...base, debug }] });
    expect(r!.signals[0].debug).toEqual(debug);
  });
  it('debug의 reason/raw가 null이어도 허용', () => {
    const r = parseDetectResponse({ ...SAMPLE, signals: [{ ...base, debug: { reason: null, raw: null } }] });
    expect(r!.signals[0].debug).toEqual({ reason: null, raw: null });
  });
  it('debug 형식이 틀리면 거부', () => {
    expect(parseDetectResponse({ ...SAMPLE, signals: [{ ...base, debug: 'x' }] })).toBeNull();
    expect(parseDetectResponse({ ...SAMPLE, signals: [{ ...base, debug: { reason: 1, raw: null } }] })).toBeNull();
    expect(parseDetectResponse({ ...SAMPLE, signals: [{ ...base, debug: { reason: null, raw: [1] } }] })).toBeNull();
  });
});

// 사용자 피드백의 실제 응답 예 그대로
const EX = res({
  verdict: 'likely_ai', ai_probability: 0.9262, partial: false, cached: false, request_id: 'req-ex',
  signals: [
    sig({ id: 'yt_no_ai_label', kind: 'rule', via: 'api', score: 0.5, weight: 0, present: false,
      debug: { reason: null, raw: { via: 'api', answer_ids: [], attribution: false, ai_badge: false } } }),
    sig({ id: 'yt_self_report_ai', kind: 'rule', via: 'api', score: 0.5, weight: 0, present: false,
      debug: { reason: null, raw: { via: 'api', level: null, has_description: false } } }),
    sig({ id: 'd3', score: 0.5, weight: 0, debug: { reason: 'weight 0 (disabled)', raw: { raw: 6.815, frames: 16 } } }),
    sig({ id: 'commfor_224', score: 0.631, weight: 0.25,
      debug: { reason: null, raw: { mean: 0.631, top25: 0.999, frames: 16, aggregate: 'mean' } } }),
    sig({ id: 'hive', score: 1, weight: 1,
      debug: { reason: null, raw: { mean: 1, top25: 1, frames: 9, top_generator: 'kling', audio: 0, deepfake: 0, aggregate: 'top25' } } }),
  ],
});
const field = (c: { fields: { label: string; value: string }[] }, label: string) => c.fields.find((f) => f.label === label)?.value;

describe('개발 모드 표 (debugView)', () => {
  it('판정 요약: 한국어 판정 + 원값, 확률 넷째 자리 + %, partial/cached 풀이, request_id', () => {
    expect(debugSummaryFor(EX)).toEqual({
      verdict: '최종 판정: AI 가능성 높음 (likely_ai)',
      probability: 'AI 가능성 0.9262 (93%)',
      partial: '영상 화면까지 확인함 (partial=false)',
      cached: '새로 분석함 (cached=false)',
      requestId: 'request_id req-ex',
    });
    const s2 = debugSummaryFor(res({ verdict: 'unknown', ai_probability: null, partial: true, cached: true }));
    expect(s2.verdict).toBe('최종 판정: 분석 불가 (unknown)');
    expect(s2.probability).toBe('AI 가능성 계산 불가 (null)');
    expect(s2.partial).toContain('유튜브 표시만으로 판정');
    expect(s2.cached).toBe('이전 결과 재사용 — 과금 없음 (cached=true)');
  });

  it('계산식: weight>0 & ok 신호만, 서버값과 같으면 조정 줄 없음', () => {
    const c = debugCalcFor(EX);
    expect(c.formula).toBe('(0.631×0.25 + 1.000×1) ÷ (0.25 + 1) = 0.9262');
    expect(c.adjusted).toBeNull();
    expect(c.decisive).toBeNull();
  });

  it('정책 조정 줄: 상한(0.74) 케이스', () => {
    const c = debugCalcFor(res({ ...EX, verdict: 'uncertain', ai_probability: 0.74 }));
    expect(c.adjusted).toBe('서버 정책으로 조정됨: 계산 0.9262 → 최종 0.7400');
  });

  it('정책 조정 줄: decisive 케이스 → 확정 신호 표시', () => {
    const lbl = sig({ id: 'yt_creator_ai_disclosure', kind: 'rule', via: 'api', score: 1, weight: 0, present: true, decisive: true });
    const r = res({ verdict: 'likely_ai', ai_probability: 0.95,
      signals: [lbl, sig({ id: 'commfor_224', score: 0.2, weight: 0.25 })] });
    const c = debugCalcFor(r);
    expect(c.formula).toBe('(0.200×0.25) ÷ (0.25) = 0.2000');
    expect(c.adjusted).toBe('서버 정책으로 조정됨: 계산 0.2000 → 최종 0.9500');
    expect(c.decisive).toBe('확정 신호: yt_creator_ai_disclosure');
  });

  it('계산에 들어간 신호가 없으면 안내', () => {
    const c = debugCalcFor(res({ ai_probability: null, verdict: 'unknown', signals: [hive, d3] }));
    expect(c.formula).toContain('계산에 들어간 신호 없음');
    expect(c.computed).toBeNull();
    expect(c.adjusted).toBeNull();
  });

  it('그룹 분리 + 기여도(w·s ÷ Σw·s): hive ≈ 86.4%, commfor ≈ 13.6%', () => {
    const g = debugGroupsFor(EX);
    expect(g.used.title).toBe('계산에 들어간 신호');
    expect(g.used.cards.map((c) => c.id)).toEqual(['commfor_224', 'hive']);
    expect(g.excluded.cards.map((c) => c.id)).toEqual(['yt_no_ai_label', 'yt_self_report_ai', 'd3']);
    const [cf, hv] = g.used.cards;
    expect(field(hv, '기여도')).toBe('86.4%');
    expect(field(cf, '기여도')).toBe('13.6%');
    expect(cf.title).toBe(copy.result.details.names.commfor_224);
    expect(field(cf, '종류')).toBe('모델');
    expect(field(cf, '상태')).toBe('정상');
    expect(field(cf, '점수')).toBe('0.631 (63%)');
    expect(field(cf, '비중')).toBe('0.25');
    expect(field(cf, '표시 찾음')).toBeUndefined(); // 모델은 표시 찾음 없음
    expect(field(cf, '제외·실패 이유')).toBeUndefined();
    const [yt, , dd] = g.excluded.cards;
    expect(field(yt, '종류')).toBe('규칙');
    expect(field(yt, '표시 찾음')).toBe('없음');
    expect(field(yt, '기여도')).toBeUndefined();
    expect(field(yt, '제외·실패 이유')).toBe('비중 0 (설명용)');
    expect(field(dd, '제외·실패 이유')).toBe('weight 0 (disabled)');
    expect(dd.alert).toBe(false);
  });

  it('실패 신호: 상태 실패 + 이유 빨간색, 점수 없음, 모르는 id는 id 그대로', () => {
    const g = debugGroupsFor(res({ signals: [hive, sig({ id: 'new_det', status: 'unavailable', score: null })] }));
    const [h, n] = g.excluded.cards;
    expect(h.alert).toBe(true);
    expect(field(h, '상태')).toBe('실패');
    expect(field(h, '점수')).toBe('없음');
    expect(h.fields.find((f) => f.label === '제외·실패 이유')).toEqual({ label: '제외·실패 이유', value: 'http 405: Organization paused', alert: true });
    expect(n.title).toBe('new_det');
    expect(field(n, '상태')).toBe('확인 못 함');
    expect(field(n, '제외·실패 이유')).toBe('확인 못 함');
  });

  it('raw 한국어 변환 (예시 응답 그대로)', () => {
    const lines = (id: string) => [...debugGroupsFor(EX).used.cards, ...debugGroupsFor(EX).excluded.cards].find((c) => c.id === id)!.rawLines;
    expect(lines('hive')).toEqual([
      '프레임 평균: 1', '상위 25% 프레임 평균: 1', '분석 프레임 9개', '생성기 추정(참고): kling',
      'AI 음성 가능성: 0', '딥페이크 가능성: 0', '집계 방식: 상위 25% (top25)',
    ]);
    expect(lines('commfor_224')).toEqual(['프레임 평균: 0.631', '상위 25% 프레임 평균: 0.999', '분석 프레임 16개', '집계 방식: 평균 (mean)']);
    expect(lines('d3')).toEqual(['원점수: 6.815', '분석 프레임 16개']);
    expect(lines('yt_no_ai_label')).toEqual(['조회 경로: api', '유튜브 도움말 id: 없음', '출처 표시: 아니오', 'AI 배지: 아니오']);
    expect(lines('yt_self_report_ai')).toEqual(['조회 경로: api', 'AI 언급 강도: 없음', '설명란 있음: 아니오']);
  });

  it('raw: null/빈 객체 → [], 모르는 키는 key=value', () => {
    expect(rawLinesFor(null)).toEqual([]);
    expect(rawLinesFor({})).toEqual([]);
    expect(rawLinesFor({ a: { b: 1 }, c: 'x', d: null, e: 0.12345 })).toEqual(['a={"b":1}', 'c=x', 'd=null', 'e=0.123']);
  });

  it('용어 설명: verdict 4종 + partial, cached, weight 0, decisive', () => {
    const terms = DEBUG_GLOSSARY.map((g) => g.term).join(' ');
    for (const t of ['likely_ai', 'uncertain', 'likely_real', 'unknown', 'partial', 'cached', 'weight 0', 'decisive']) {
      expect(terms).toContain(t);
    }
  });

});

describe('개발 모드 데이터가 사용자 화면에 영향 없음', () => {
  it('debug 필드가 있어도 detailRowsFor(사용자 화면) 결과는 불변', () => {
    const strip = (s: Signal): Signal => { const { debug: _d, ...rest } = s; return rest; };
    const withDbg = res({ verdict: 'uncertain', signals: [hive, d3, commfor, rule] });
    const noDbg = res({ verdict: 'uncertain', signals: withDbg.signals.map(strip) });
    expect(detailRowsFor(withDbg)).toEqual(detailRowsFor(noDbg));
    expect(detailRowsFor(withDbg).some((r) => r.name === 'd3' || r.key.startsWith('d3'))).toBe(false);
  });
});

describe('ResultScreen 개발 모드', () => {
  const signals = [hive, d3, commfor];
  it('debug on: 자세히 보기 기본 펼침 + 원시 표 (사람용 행 대신)', () => {
    render(<ResultScreen data={res({ verdict: 'uncertain', signals })} url="https://youtu.be/x" onRetry={noop} onAgain={noop} onSubmitVideo={noop} debug />);
    expect(screen.getByTestId('debug-table')).toBeTruthy();
    expect(screen.getByText('http 405: Organization paused')).toBeTruthy();
    expect(screen.getByText(/화면 움직임 확인/)).toBeTruthy();
    expect(screen.getByText('계산에 들어간 신호 (1)')).toBeTruthy();
    expect(screen.getByText('설명용·제외된 신호 (2)')).toBeTruthy();
    expect(screen.queryByTestId('debug-glossary')).toBeNull();
    fireEvent.press(screen.getByText('용어 설명 펼치기 ▼'));
    expect(screen.getByTestId('debug-glossary')).toBeTruthy();
    expect(screen.queryByText(copy.result.details.modelCaution)).toBeNull();
    fireEvent.press(screen.getByText(copy.result.details.toggle));
    expect(screen.queryByTestId('debug-table')).toBeNull();
  });
  it('debug on: linkOnly(자세히 보기 행 0개)여도 표를 보여준다', () => {
    const p = parseDetectResponse(SERVER_URL_PARTIAL)!;
    render(<ResultScreen data={{ ...p, verdict: 'unknown', partial: true }} url="https://youtu.be/x" onRetry={noop} onAgain={noop} onSubmitVideo={noop} debug />);
    expect(screen.getByTestId('debug-table')).toBeTruthy();
  });
  it('debug off(기본): 기존 화면 그대로 — 접힘, 원시 표 없음', () => {
    render(<ResultScreen data={res({ verdict: 'uncertain', signals })} url="https://youtu.be/x" onRetry={noop} onAgain={noop} onSubmitVideo={noop} />);
    expect(screen.queryByTestId('debug-table')).toBeNull();
    expect(screen.queryByText('AI 가능성 4%')).toBeNull();
    fireEvent.press(screen.getByText(copy.result.details.toggle));
    expect(screen.getByText('AI 가능성 4%')).toBeTruthy();
    expect(screen.queryByTestId('debug-table')).toBeNull();
    expect(screen.queryByText(/계산식/)).toBeNull();
    expect(screen.queryByText(/http 405/)).toBeNull();
  });
});
