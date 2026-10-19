// service worker 핵심(lib/service.js): 토큰 저장 위치, 401 처리, 로그인·로그아웃·기록.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createService, AUTH_KEY, SERVER_KEY, isAuthExpired } from '../lib/service.js';

/** chrome.storage.* 흉내 (get(null|string|string[]), set, remove) */
function fakeArea(init = {}) {
  const data = { ...init };
  return {
    data,
    async get(k) {
      if (k === null || k === undefined) return { ...data };
      const keys = Array.isArray(k) ? k : [k];
      return Object.fromEntries(keys.filter((x) => x in data).map((x) => [x, data[x]]));
    },
    async set(o) {
      Object.assign(data, structuredClone(o));
    },
    async remove(k) {
      for (const x of Array.isArray(k) ? k : [k]) delete data[x];
    },
  };
}

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const detectBody = {
  request_id: 'r',
  platform: 'youtube',
  video_id: 'dQw4w9WgXcQ',
  ai_probability: 0.9,
  verdict: 'likely_ai',
  partial: false,
  signals: [],
  cached: false,
  analyzed_at: '',
};
const VIDEO_TAB = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x';
const ORIGIN = 'http://localhost:8000';

/** 경로별 응답을 주는 fake 서버. calls 에 요청 기록 */
function fakeServer(routes) {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method || 'GET'} ${u.pathname}`;
    calls.push({ key, url, headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : undefined });
    const h = routes[key];
    if (!h) return json(404, { error: { code: 'not_found' } });
    return typeof h === 'function' ? h(init) : h;
  };
  return { calls, fetchFn };
}

function setup({ routes = {}, local = {}, session = {} } = {}) {
  const L = fakeArea(local);
  const S = fakeArea(session);
  const srv = fakeServer(routes);
  const service = createService({
    local: L,
    session: S,
    fetchFn: srv.fetchFn,
    getTabUrl: async () => VIDEO_TAB,
    hasPermission: async () => true,
    now: () => 1000,
  });
  return { L, S, srv, service };
}

const loginOk = json(200, { token: 'tok-123', user: { id: 'u1', email: 'a@b.com', created_at: '' } });
const loggedIn = { [AUTH_KEY]: { token: 'tok-old', email: 'a@b.com', origin: ORIGIN, at: 1 } };

test('로그인 성공: 토큰은 storage.local 에만, 팝업 응답에는 토큰 없음, device_name "Chrome 확장"', async () => {
  const { L, S, srv, service } = setup({ routes: { 'POST /v1/auth/login': loginOk } });
  const r = await service.login({ email: ' a@b.com ', password: 'pw123456' });
  assert.deepEqual(r, { ok: true, email: 'a@b.com' });
  assert.equal(JSON.stringify(r).includes('tok-123'), false);
  assert.equal(L.data[AUTH_KEY].token, 'tok-123');
  assert.equal(L.data[AUTH_KEY].origin, ORIGIN);
  assert.equal(JSON.stringify(S.data).includes('tok-123'), false, 'session 저장소에 토큰 금지');
  assert.deepEqual(srv.calls[0].body, { email: 'a@b.com', password: 'pw123456', device_name: 'Chrome 확장' });
  assert.equal(srv.calls[0].headers.Authorization, undefined, '로그인 요청에는 Bearer 없음');
  const st = await service.status();
  assert.deepEqual(st, { ok: true, loggedIn: true, email: 'a@b.com', server: ORIGIN });
  assert.equal(JSON.stringify(st).includes('tok-123'), false);
});

test('회원가입: device_name 포함, 201 토큰을 바로 저장', async () => {
  const { L, srv, service } = setup({
    routes: { 'POST /v1/auth/signup': json(201, { token: 'tok-new', user: { id: 'u', email: 'n@b.com', created_at: '' } }) },
  });
  const r = await service.signup({ email: 'n@b.com', password: '12345678' });
  assert.equal(r.ok, true);
  assert.deepEqual(srv.calls[0].body, { email: 'n@b.com', password: '12345678', device_name: 'Chrome 확장' });
  assert.equal(L.data[AUTH_KEY].token, 'tok-new');
});

test('회원가입 입력 검사: 8자 미만은 서버에 보내지 않는다', async () => {
  const { srv, service } = setup();
  assert.deepEqual((await service.signup({ email: 'a@b.com', password: '1234567' })).error, {
    kind: 'input',
    field: 'password',
    code: 'weak_password',
  });
  assert.equal((await service.login({ email: '', password: 'x' })).error.code, 'empty_email');
  assert.equal((await service.login({ email: 'a@b.com', password: '' })).error.code, 'empty_password');
  assert.equal(srv.calls.length, 0);
});

test('로그인 실패(401 invalid_credentials): 토큰 저장 안 함, auth_required 아님', async () => {
  const { L, service } = setup({
    routes: { 'POST /v1/auth/login': json(401, { error: { code: 'invalid_credentials', message_ko: 'x' } }) },
  });
  const r = await service.login({ email: 'a@b.com', password: 'wrongpass' });
  assert.deepEqual(r.error, { kind: 'api', status: 401, code: 'invalid_credentials' });
  assert.equal(AUTH_KEY in L.data, false);
  assert.equal(isAuthExpired(r.error), false);
});

test('토큰 없이 확인 → auth_required(missing), 서버 호출 없음 (캐시가 있어도)', async () => {
  const { srv, service } = setup({
    session: { 'result:youtube:dQw4w9WgXcQ': { data: detectBody, at: 1 } },
  });
  const r = await service.detect({ tabId: 1 });
  assert.deepEqual(r.error, { kind: 'auth_required', reason: 'missing' });
  assert.equal(srv.calls.length, 0);
});

test('확인: Bearer 헤더, 정규화 URL, 세션 캐시', async () => {
  const { S, srv, service } = setup({ local: loggedIn, routes: { 'POST /v1/detect': json(200, detectBody) } });
  const r = await service.detect({ tabId: 1 });
  assert.equal(r.ok, true);
  assert.equal(r.fromCache, false);
  assert.equal(srv.calls[0].headers.Authorization, 'Bearer tok-old');
  assert.deepEqual(srv.calls[0].body, { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', source: 'paste' });
  assert.ok(S.data['result:youtube:dQw4w9WgXcQ']);
  const again = await service.detect({ tabId: 1 });
  assert.equal(again.fromCache, true);
  assert.equal(srv.calls.length, 1);
});

test('401 unauthorized → 토큰·결과 캐시 삭제 후 auth_required(expired)', async () => {
  const { L, S, service } = setup({
    local: { ...loggedIn, [SERVER_KEY]: ORIGIN },
    session: { 'result:youtube:other1234567': { data: detectBody, at: 1 }, keep: 1 },
    routes: { 'POST /v1/detect': json(401, { error: { code: 'unauthorized', message_ko: 'x' } }) },
  });
  const r = await service.detect({ tabId: 1, force: true });
  assert.deepEqual(r.error, { kind: 'auth_required', reason: 'expired' });
  assert.equal(AUTH_KEY in L.data, false, '토큰 삭제');
  assert.equal(L.data[SERVER_KEY], ORIGIN, '서버 주소는 남긴다');
  assert.equal('result:youtube:other1234567' in S.data, false, '결과 캐시 삭제');
  assert.equal(S.data.keep, 1);
  assert.equal((await service.status()).loggedIn, false);
});

test('401 이 본문 없이 와도(code null) 만료로 처리', async () => {
  const { L, service } = setup({ local: loggedIn, routes: { 'GET /v1/history': json(401, null) } });
  const r = await service.history();
  assert.equal(r.error.kind, 'auth_required');
  assert.equal(AUTH_KEY in L.data, false);
});

test('기록: GET /v1/history?limit=10, Bearer, source null 허용', async () => {
  const { srv, service } = setup({
    local: loggedIn,
    routes: {
      'GET /v1/history': json(200, {
        items: [
          { id: 'h1', checked_at: '2026-10-19T00:00:00Z', source: null, platform: 'youtube', video_id: 'x', url: 'https://youtube.com/shorts/x', verdict: 'likely_ai', ai_probability: 0.9, device_name: 'iPhone 앱' },
          'broken',
        ],
        next: null,
      }),
    },
  });
  const r = await service.history();
  assert.equal(r.ok, true);
  assert.equal(new URL(srv.calls[0].url).searchParams.get('limit'), '10');
  assert.equal(srv.calls[0].headers.Authorization, 'Bearer tok-old');
  assert.equal(r.data.items.length, 1);
  assert.equal(r.data.items[0].source, null);
});

test('로그아웃: 서버가 실패해도 토큰 삭제, 요청에는 Bearer', async () => {
  const { L, srv, service } = setup({ local: loggedIn, routes: { 'POST /v1/auth/logout': json(500, null) } });
  const r = await service.logout();
  assert.equal(r.ok, true);
  assert.equal(AUTH_KEY in L.data, false);
  assert.equal(srv.calls[0].headers.Authorization, 'Bearer tok-old');
});

test('서버 주소를 바꾸면 이전 서버 토큰은 쓰지 않고 지운다', async () => {
  const { L, srv, service } = setup({ local: { ...loggedIn, [SERVER_KEY]: 'https://abc.trycloudflare.com' } });
  const r = await service.detect({ tabId: 1 });
  assert.equal(r.error.kind, 'auth_required');
  assert.equal(AUTH_KEY in L.data, false);
  assert.equal(srv.calls.length, 0, '다른 서버로 토큰을 보내지 않는다');
});

test('영상 탭이 아니면 not_video (로그인 여부와 무관하게 서버 호출 없음)', async () => {
  const L = fakeArea(loggedIn);
  const srv = fakeServer({});
  const service = createService({ local: L, session: fakeArea(), fetchFn: srv.fetchFn, getTabUrl: async () => 'https://www.youtube.com/' });
  assert.equal((await service.detect({ tabId: 1 })).error.kind, 'not_video');
  assert.equal(srv.calls.length, 0);
});
