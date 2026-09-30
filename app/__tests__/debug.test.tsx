// 개발 모드 원시 표 (계약 v1.3 signals[].debug, EXPO_PUBLIC_DEBUG=1)
import { fireEvent, render, screen } from '@testing-library/react-native';
import { parseDetectResponse, type DetectResponse, type Signal } from '../src/api/contract';
import { ResultScreen } from '../src/screens/ResultScreen';
import { copy } from '../src/ux/copy';
import { debugHeaderFor, debugRowsFor, detailRowsFor, fmtRaw } from '../src/ux/present';
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

describe('debugRowsFor / debugHeaderFor', () => {
  it('헤더: verdict, ai_probability 소수 넷째, partial, cached, request_id', () => {
    const h = debugHeaderFor(res({ verdict: 'uncertain', ai_probability: 0.123456, partial: true, cached: false, request_id: 'req-1' }));
    expect(h).toBe('verdict=uncertain  ai_probability=0.1235  partial=true  cached=false  request_id=req-1');
    expect(debugHeaderFor(res({ ai_probability: null }))).toContain('ai_probability=null');
  });
  it('모든 신호를 서버 순서대로 (가중치 0, error 포함), score 소수 셋째·null은 "null"', () => {
    const rows = debugRowsFor(res({ signals: [hive, d3, commfor, rule] }));
    expect(rows.map((r) => r.id)).toEqual(['hive', 'd3', 'commfor_224', 'yt_ai_label']);
    expect(rows[0]).toMatchObject({ status: 'error', score: 'null', weight: '0.500', reason: 'http 405: Organization paused', raw: null, alert: true });
    expect(rows[1]).toMatchObject({ score: '0.123', weight: '0', reason: 'weight 0 (disabled)', raw: 'mean=0.980 top25=1 frames=20' });
    expect(rows[2]).toMatchObject({ score: '0.041', reason: null, raw: null, alert: false, present: 'null' });
    expect(rows[3]).toMatchObject({ kind: 'rule', present: 'false', decisive: 'true' });
  });
  it('debug 필드 없음 → reason/raw null', () => {
    const rows = debugRowsFor(res({ signals: [sig({ status: 'unavailable', score: null })] }));
    expect(rows[0]).toMatchObject({ status: 'unavailable', score: 'null', reason: null, raw: null, alert: true });
  });
  it('fmtRaw: 빈 객체/null → null, 중첩은 JSON', () => {
    expect(fmtRaw(null)).toBeNull();
    expect(fmtRaw({})).toBeNull();
    expect(fmtRaw({ a: { b: 1 }, c: 'x', d: null })).toBe('a={"b":1} c=x d=null');
  });
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
    expect(screen.getByText('reason=http 405: Organization paused')).toBeTruthy();
    expect(screen.getByText('d3')).toBeTruthy();
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
    expect(screen.queryByText(/reason=/)).toBeNull();
  });
});
