import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDetectResponse, errorFromHttp, ERROR_CODES } from '../lib/contract.js';
import { toDisplayModel, errorToDisplay, formatPercent, formatCheckedAgo, VERDICT_VIEW } from '../lib/display.js';

function sig(over = {}) {
  return {
    id: 'x',
    kind: 'rule',
    status: 'ok',
    decisive: false,
    score: 0.5,
    weight: 1,
    evidence_ko: '근거',
    via: 'api',
    present: true,
    ...over,
  };
}
function resp(over = {}) {
  return {
    request_id: 'r1',
    platform: 'youtube',
    video_id: 'dQw4w9WgXcQ',
    ai_probability: 0.87,
    verdict: 'likely_ai',
    partial: false,
    signals: [],
    cached: false,
    analyzed_at: '2026-10-13T00:00:00Z',
    ...over,
  };
}
const model = (body) => toDisplayModel(parseDetectResponse(body));

test('verdict 별 헤드라인·보조문·색 (senior-ux-korean 표)', () => {
  const expect = {
    likely_ai: ['red', 'AI로 만든 영상일 가능성이 높아요', '다른 분께 보내기 전에 한 번 더 생각해 주세요'],
    uncertain: ['yellow', 'AI로 만들었는지 확실하지 않아요', '출처가 확실한 곳에서 같은 내용을 찾아보세요'],
    likely_real: ['green', 'AI로 만든 흔적은 찾지 못했어요', '그래도 내용이 사실인지는 따로 확인이 필요해요'],
    unknown: ['gray', '이 영상은 확인하지 못했어요', '잠시 후 다시 시도해 주세요'],
  };
  for (const [verdict, [tone, headline, sub]] of Object.entries(expect)) {
    const m = model(resp({ verdict, ai_probability: verdict === 'unknown' ? null : 0.5 }));
    assert.equal(m.tone, tone);
    assert.equal(m.headline, headline);
    assert.equal(m.sub, sub);
    assert.ok(m.icon, '색만으로 전달하지 않도록 아이콘 문자 필요');
  }
  // 아이콘이 verdict 마다 다르다(색각 이상 대비)
  assert.equal(new Set(Object.values(VERDICT_VIEW).map((v) => v.icon)).size, 4);
});

test('verdict 는 서버 값 그대로 — 확률로 재계산하지 않는다', () => {
  const m = model(resp({ verdict: 'likely_ai', ai_probability: 0.1 }));
  assert.equal(m.verdict, 'likely_ai');
  assert.equal(m.percent, 'AI 가능성 10%');
});

test('퍼센트 표기', () => {
  assert.equal(formatPercent(0.87), 'AI 가능성 87%');
  assert.equal(formatPercent(0.005), 'AI 가능성 1%');
  assert.equal(formatPercent(1), 'AI 가능성 100%');
  assert.equal(formatPercent(null), null);
  assert.equal(model(resp({ verdict: 'unknown', ai_probability: null })).percent, null);
});

test('근거: status ok + 문장 있는 것만, decisive 먼저, 최대 3개', () => {
  const m = model(
    resp({
      signals: [
        sig({ id: 'a', evidence_ko: '첫째' }),
        sig({ id: 'b', status: 'unavailable', score: null, present: null, evidence_ko: '못 봄' }),
        sig({ id: 'c', evidence_ko: '' }),
        sig({ id: 'd', evidence_ko: '둘째' }),
        sig({ id: 'e', decisive: true, evidence_ko: '결정적' }),
        sig({ id: 'g', kind: 'model', present: null, weight: 0, decisive: false, evidence_ko: '꺼진 모델' }),
        sig({ id: 'f', kind: 'model', present: null, evidence_ko: '넷째' }),
      ],
    }),
  );
  assert.deepEqual(m.evidence, ['결정적', '첫째', '둘째']);
});

test('근거: 꺼진 모델(weight 0)은 빼고, 규칙 weight 0(설명용)은 보여준다', () => {
  const m = model(
    resp({
      signals: [
        sig({ id: 'd3', kind: 'model', weight: 0, present: null, evidence_ko: '꺼진 모델' }),
        sig({ id: 'rule0', weight: 0, evidence_ko: '설명용 규칙' }),
        sig({ id: 'hive', kind: 'model', weight: 1, present: null, evidence_ko: '모델 근거' }),
      ],
    }),
  );
  assert.deepEqual(m.evidence, ['설명용 규칙', '모델 근거']);
});

test('D1: 주소 확인 + unknown + partial → 주소만으로는 어려움, 퍼센트·근거 숨김', () => {
  const m = model(
    resp({ verdict: 'unknown', ai_probability: null, partial: true, signals: [sig({ evidence_ko: '규칙 근거' })] }),
  );
  assert.equal(m.urlOnly, true);
  assert.equal(m.headline, '이 영상은 주소만으로는 확인이 어려워요');
  assert.equal(m.percent, null);
  assert.deepEqual(m.evidence, []);
  // partial 이지만 확률이 있으면 일반 표시
  const m2 = model(resp({ verdict: 'uncertain', ai_probability: 0.5, partial: true }));
  assert.equal(m2.urlOnly, false);
  assert.equal(m2.percent, 'AI 가능성 50%');
});

test('debug: 서버가 주면 신호별 행을 그대로, 없으면 null', () => {
  assert.equal(model(resp({ signals: [sig()] })).debugRows, null);
  const m = model(
    resp({
      signals: [
        sig({ id: 'hive', kind: 'model', status: 'error', score: null, weight: 0.6, present: null, debug: { reason: 'http 405: Organization paused', raw: null } }),
        sig({ id: 'platform_ai_label', score: 0, weight: 1, debug: { reason: null, raw: { x: 1 } } }),
        sig({ id: 'no_debug', score: 0.3, weight: 0 }),
      ],
    }),
  );
  assert.deepEqual(m.debugRows, [
    { id: 'hive', status: 'error', score: null, weight: 0.6, reason: 'http 405: Organization paused' },
    { id: 'platform_ai_label', status: 'ok', score: 0, weight: 1, reason: null },
    { id: 'no_debug', status: 'ok', score: 0.3, weight: 0, reason: null },
  ]);
});

test('응답 검사: 형식이 틀리면 null', () => {
  assert.equal(parseDetectResponse(null), null);
  assert.equal(parseDetectResponse(resp({ verdict: 'maybe' })), null);
  assert.equal(parseDetectResponse(resp({ ai_probability: '0.8' })), null);
  assert.equal(parseDetectResponse(resp({ signals: [sig({ score: 'x' })] })), null);
  assert.equal(parseDetectResponse(resp({ signals: null })), null);
  // score null 허용 (v1.1), present 누락은 null 로 (v1.2 이전 서버)
  const p = parseDetectResponse(resp({ signals: [{ ...sig({ score: null, status: 'unavailable' }), present: undefined }] }));
  assert.equal(p.signals[0].score, null);
  assert.equal(p.signals[0].present, null);
  assert.equal('debug' in p.signals[0], false);
});

test('에러 코드 → senior-ux-korean 문구', () => {
  const expect = {
    video_unavailable: '영상을 열 수 없어요. 삭제되었거나 비공개 영상일 수 있어요',
    rate_limited: '잠시 후 다시 시도해 주세요',
    detectors_down: '지금은 확인이 어려워요. 잠시 후 다시 시도해 주세요',
    unsupported_platform: '아직 이 사이트의 영상은 확인할 수 없어요. 지금은 유튜브 영상을 확인할 수 있어요',
  };
  for (const [code, msg] of Object.entries(expect)) {
    assert.equal(errorToDisplay({ kind: 'api', status: 400, code }).message, msg, code);
  }
  for (const code of ERROR_CODES) {
    const d = errorToDisplay({ kind: 'api', status: 400, code });
    assert.ok(d.message && !d.message.includes('undefined'), code);
  }
  assert.equal(errorToDisplay({ kind: 'api', code: 'video_unavailable' }).canRetry, false);
  assert.equal(errorToDisplay({ kind: 'api', code: 'rate_limited' }).canRetry, true);
  // 모르는 코드 / 코드 없음 → 일반 문구
  assert.equal(errorToDisplay({ kind: 'api', status: 500, code: null }).message, expect.detectors_down);
  assert.equal(errorToDisplay({ kind: 'api', status: 418, code: 'teapot' }).message, expect.detectors_down);
});

test('네트워크·권한 에러는 설정 링크를 보여준다', () => {
  const net = errorToDisplay({ kind: 'network' });
  assert.equal(net.message, '지금은 확인이 어려워요. 잠시 후 다시 시도해 주세요');
  assert.equal(net.showOptions, true);
  assert.equal(errorToDisplay({ kind: 'permission' }).showOptions, true);
  assert.equal(errorToDisplay({ kind: 'timeout' }).canRetry, true);
  assert.equal(errorToDisplay({ kind: 'not_video' }).canRetry, false);
  assert.equal(errorToDisplay(undefined).message, net.message);
});

test('HTTP 에러 본문 파싱', () => {
  assert.deepEqual(errorFromHttp(404, { error: { code: 'video_unavailable', message_ko: '...' } }), {
    kind: 'api',
    status: 404,
    code: 'video_unavailable',
  });
  assert.deepEqual(errorFromHttp(502, null), { kind: 'api', status: 502, code: null });
  assert.deepEqual(errorFromHttp(500, '<html>'), { kind: 'api', status: 500, code: null });
});

test('캐시 안내 문구', () => {
  assert.equal(formatCheckedAgo(1000, 1000 + 30_000), '방금 확인한 결과예요');
  assert.equal(formatCheckedAgo(0, 5 * 60_000), '5분 전에 확인한 결과예요');
  assert.equal(formatCheckedAgo(0, 2 * 3_600_000), '2시간 전에 확인한 결과예요');
});
