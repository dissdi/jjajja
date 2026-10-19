// 팝업 상태 전이 (lib/flow.js) + 로그인 문구·기록 표시 (lib/display.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, reduce } from '../lib/flow.js';
import { authErrorToDisplay, historyItemView, formatWhen, AUTH_COPY } from '../lib/display.js';
import { ERROR_CODES, parseAuthResponse, parseHistoryResponse } from '../lib/contract.js';

const run = (events, s = initialState()) => events.reduce(reduce, s);
const okDetect = { ok: true, data: { verdict: 'likely_ai', signals: [] } };
const expired = { ok: false, error: { kind: 'auth_required', reason: 'expired' } };

test('토큰 없음 → 로그인 화면, 토큰 있음 → 바로 확인', () => {
  assert.equal(run([{ type: 'status', loggedIn: false }]).screen, 'login');
  const s = run([{ type: 'status', loggedIn: true, email: 'a@b.com' }]);
  assert.equal(s.screen, 'loading');
  assert.equal(s.email, 'a@b.com');
});

test('로그인 성공 → 바로 현재 영상 확인(loading) → 결과', () => {
  let s = run([{ type: 'status', loggedIn: false }, { type: 'auth_submit' }]);
  assert.equal(s.pending, true);
  assert.equal(reduce(s, { type: 'auth_submit' }), s, '중복 제출 무시');
  s = reduce(s, { type: 'auth_done', response: { ok: true, email: 'a@b.com' } });
  assert.equal(s.screen, 'loading');
  assert.equal(s.pending, false);
  s = reduce(s, { type: 'detect_done', response: okDetect });
  assert.equal(s.screen, 'result');
});

test('로그인 실패 → 로그인 화면에 남고 문구 표시', () => {
  const s = run([
    { type: 'status', loggedIn: false },
    { type: 'auth_submit' },
    { type: 'auth_done', response: { ok: false, error: { kind: 'api', status: 401, code: 'invalid_credentials' } } },
  ]);
  assert.equal(s.screen, 'login');
  assert.equal(s.pending, false);
  assert.equal(s.authError.message, '이메일이나 비밀번호가 맞지 않아요. 다시 확인해 주세요');
});

test('회원가입 전환, 이미 가입한 이메일 → 로그인 모드로 돌아감', () => {
  let s = run([{ type: 'status', loggedIn: false }, { type: 'toggle_mode' }]);
  assert.equal(s.authMode, 'signup');
  s = run([{ type: 'auth_submit' }, { type: 'auth_done', response: { ok: false, error: { kind: 'api', status: 409, code: 'email_taken' } } }], s);
  assert.equal(s.authMode, 'login');
  assert.equal(s.authError.message, '이미 가입한 이메일이에요. 로그인해 주세요');
});

test('확인 중 401 → 로그인 화면 + 만료 안내, 상태 초기화', () => {
  const s = run([{ type: 'status', loggedIn: true, email: 'a@b.com' }, { type: 'detect_done', response: expired }]);
  assert.equal(s.screen, 'login');
  assert.equal(s.notice, 'expired');
  assert.equal(s.email, null);
  assert.equal(s.detect, null);
});

test('기록: 열기 → 결과 → 돌아가기, 기록 중 401 → 로그인', () => {
  let s = run([{ type: 'status', loggedIn: true }, { type: 'detect_done', response: okDetect }, { type: 'history_open' }]);
  assert.equal(s.screen, 'history');
  assert.equal(s.history.loading, true);
  s = reduce(s, { type: 'history_done', response: { ok: true, data: { items: [{ id: '1' }], next: null } } });
  assert.equal(s.history.items.length, 1);
  s = reduce(s, { type: 'history_back' });
  assert.equal(s.screen, 'result');
  const s2 = run([{ type: 'history_open' }, { type: 'history_done', response: expired }], s);
  assert.equal(s2.screen, 'login');
  assert.equal(s2.notice, 'expired');
});

test('로그아웃 → 어디서든 로그인 화면, 늦게 온 확인 결과는 무시', () => {
  let s = run([{ type: 'status', loggedIn: true }, { type: 'logout' }]);
  assert.equal(s.screen, 'login');
  assert.equal(s.notice, null);
  s = reduce(s, { type: 'detect_done', response: okDetect });
  assert.equal(s.screen, 'login');
});

test('다시 확인: 결과/에러 → loading, 로그인 화면에서는 무시', () => {
  const r = run([{ type: 'status', loggedIn: true }, { type: 'detect_done', response: { ok: false, error: { kind: 'network' } } }]);
  assert.equal(r.screen, 'error');
  assert.equal(reduce(r, { type: 'detect_start' }).screen, 'loading');
  const l = run([{ type: 'status', loggedIn: false }]);
  assert.equal(reduce(l, { type: 'detect_start' }).screen, 'login');
});

test('로그인 에러 문구: 계약 v2.0 코드 전부 + 입력 검사 + 네트워크', () => {
  const cases = {
    invalid_credentials: [null, '이메일이나 비밀번호가 맞지 않아요. 다시 확인해 주세요'],
    email_taken: [null, '이미 가입한 이메일이에요. 로그인해 주세요'],
    invalid_email: ['email', '이메일 주소를 다시 확인해 주세요. 예: hong@example.com'],
    weak_password: ['password', '비밀번호를 8자 이상으로 정해 주세요'],
  };
  for (const [code, [field, msg]] of Object.entries(cases)) {
    assert.ok(ERROR_CODES.includes(code), code);
    const e = authErrorToDisplay({ kind: 'api', status: 400, code });
    assert.equal(e.message, msg, code);
    assert.equal(e.field, field, code);
  }
  assert.equal(authErrorToDisplay({ kind: 'input', field: 'email', code: 'empty_email' }).field, 'email');
  const net = authErrorToDisplay({ kind: 'network' });
  assert.equal(net.showOptions, true);
  assert.match(net.message, /서버 주소/);
  assert.equal(authErrorToDisplay(undefined).message, '지금은 확인이 어려워요. 잠시 후 다시 시도해 주세요');
  assert.equal(AUTH_COPY.passwordHint, '비밀번호는 8자 이상으로 정해 주세요');
});

test('인증·기록 응답 검사', () => {
  assert.deepEqual(parseAuthResponse({ token: 't', user: { email: 'a@b.com' } }), { token: 't', email: 'a@b.com' });
  assert.equal(parseAuthResponse({ token: '', user: { email: 'a' } }), null);
  assert.equal(parseAuthResponse({ token: 't' }), null);
  assert.equal(parseHistoryResponse({ hello: 1 }), null);
  const h = parseHistoryResponse({ items: [{ id: 3, verdict: 'weird', url: '' }], next: 'c' });
  assert.equal(h.items[0].id, '3');
  assert.equal(h.items[0].verdict, 'unknown');
  assert.equal(h.items[0].url, null);
  assert.equal(h.next, 'c');
});

test('기록 항목 표시: 판정 문구·퍼센트·시각·기기, 유튜브 주소만 링크', () => {
  const now = Date.parse('2026-10-19T12:00:00Z');
  const v = historyItemView(
    { id: '1', checked_at: '2026-10-19T11:55:00Z', verdict: 'likely_ai', ai_probability: 0.87, device_name: 'iPhone 앱', url: 'https://www.youtube.com/shorts/abc', source: null },
    now,
  );
  assert.equal(v.headline, 'AI로 만든 영상일 가능성이 높아요');
  assert.equal(v.percent, 'AI 가능성 87%');
  assert.equal(v.meta, '5분 전 · iPhone 앱');
  assert.equal(v.url, 'https://www.youtube.com/shorts/abc');
  const evil = historyItemView({ id: '2', checked_at: '', verdict: 'unknown', ai_probability: null, device_name: '', url: 'javascript:alert(1)' }, now);
  assert.equal(evil.url, null);
  assert.equal(evil.percent, null);
  const file = historyItemView({ id: '3', checked_at: '', verdict: 'likely_real', ai_probability: 0.1, device_name: '', url: null }, now);
  assert.equal(file.fileOnly, true);
  assert.equal(formatWhen('2026-10-18T11:00:00Z', now), '어제');
  assert.equal(formatWhen('2026-10-19T09:00:00Z', now), '3시간 전');
  assert.equal(formatWhen('bad', now), '');
});
