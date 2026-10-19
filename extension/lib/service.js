// service worker 의 핵심 동작(로그인·토큰·확인·기록). 크롬 API 는 주입받는다 → node --test 로 검사.
//
// 토큰 규칙 (계약 v2.0 "토큰"):
// - chrome.storage.local 의 AUTH_KEY 한 곳에만 둔다. session/sync 에 두지 않는다.
// - 팝업에는 토큰을 주지 않는다. 팝업이 받는 것은 { loggedIn, email } 뿐이다.
// - 서버가 401 을 주면 토큰과 세션 결과 캐시를 지우고 { kind: 'auth_required', reason: 'expired' } 를 돌려준다.
// - 토큰은 받은 서버 주소(origin)와 묶는다. 설정에서 서버 주소를 바꾸면 다시 로그인한다.
import { parseVideoUrl, cacheKey } from './video.js';
import { DEFAULT_SERVER, normalizeServer } from './server.js';
import { requestDetect, requestHealth, requestHistory, requestLogin, requestLogout, requestSignup } from './api.js';

export const AUTH_KEY = 'auth';
export const SERVER_KEY = 'serverUrl';
const RESULT_PREFIX = 'result:';
export const MIN_PASSWORD = 8;

const authRequired = (reason) => ({ ok: false, error: { kind: 'auth_required', reason } });

/** 인증이 필요한 엔드포인트의 401 → 토큰 만료·폐기. (로그인 실패 invalid_credentials 와 구분) */
export function isAuthExpired(error) {
  return !!error && error.kind === 'api' && error.status === 401 && error.code !== 'invalid_credentials';
}

/**
 * @param {{
 *   local: { get(k): Promise<object>, set(o): Promise<void>, remove(k): Promise<void> },
 *   session: { get(k): Promise<object>, set(o): Promise<void>, remove(k): Promise<void> },
 *   fetchFn?: typeof fetch,
 *   getTabUrl?: (tabId: number) => Promise<string | undefined>,
 *   hasPermission?: (pattern: string) => Promise<boolean>,
 *   now?: () => number,
 * }} deps
 */
export function createService({
  local,
  session,
  fetchFn = (...a) => fetch(...a),
  getTabUrl = async () => undefined,
  hasPermission = async () => true,
  now = () => Date.now(),
}) {
  async function getServer() {
    const stored = (await local.get(SERVER_KEY))[SERVER_KEY];
    return normalizeServer(stored || DEFAULT_SERVER);
  }

  /** 서버 주소·권한 확인. 문제가 있으면 error 를 돌려준다. */
  async function readyServer() {
    const server = await getServer();
    if (!server) return { error: { kind: 'no_server' } };
    if (!server.builtin && !(await hasPermission(server.pattern))) return { error: { kind: 'permission' } };
    return { server };
  }

  async function readAuth() {
    const a = (await local.get(AUTH_KEY))[AUTH_KEY];
    if (!a || typeof a.token !== 'string' || a.token === '') return null;
    return a;
  }

  /** 현재 서버 주소에 맞는 토큰. 다른 서버의 토큰이면 지우고 null. */
  async function currentAuth(server) {
    const a = await readAuth();
    if (!a) return null;
    if (server && a.origin !== server.origin) {
      await clearAuth();
      return null;
    }
    return a;
  }

  async function clearResults() {
    const all = await session.get(null);
    const keys = Object.keys(all || {}).filter((k) => k.startsWith(RESULT_PREFIX));
    if (keys.length) await session.remove(keys);
  }

  async function clearAuth() {
    await local.remove(AUTH_KEY);
    // 결과 캐시도 그 사용자 것이므로 같이 지운다.
    await clearResults();
  }

  async function status() {
    const server = await getServer();
    const a = await currentAuth(server);
    return { ok: true, loggedIn: !!a, email: a ? a.email : null, server: server ? server.origin : null };
  }

  function validateInput(email, password, mode) {
    const e = typeof email === 'string' ? email.trim() : '';
    const p = typeof password === 'string' ? password : '';
    if (e === '') return { error: { kind: 'input', field: 'email', code: 'empty_email' } };
    if (p === '') return { error: { kind: 'input', field: 'password', code: 'empty_password' } };
    if (mode === 'signup' && p.length < MIN_PASSWORD) {
      return { error: { kind: 'input', field: 'password', code: 'weak_password' } };
    }
    return { email: e, password: p };
  }

  async function authenticate(mode, { email, password }) {
    const v = validateInput(email, password, mode);
    if (v.error) return { ok: false, error: v.error };
    const { server, error } = await readyServer();
    if (error) return { ok: false, error };
    const req = mode === 'signup' ? requestSignup : requestLogin;
    const r = await req({ origin: server.origin, email: v.email, password: v.password, fetchFn });
    if (!r.ok) return r;
    await clearResults();
    await local.set({ [AUTH_KEY]: { token: r.data.token, email: r.data.email, origin: server.origin, at: now() } });
    // 팝업에는 토큰을 넘기지 않는다.
    return { ok: true, email: r.data.email };
  }

  async function logout() {
    const server = await getServer();
    const a = await readAuth();
    await clearAuth(); // 서버 응답과 상관없이 먼저 지운다
    if (a && server && a.origin === server.origin) {
      const ok = server.builtin || (await hasPermission(server.pattern));
      if (ok) await requestLogout({ origin: server.origin, token: a.token, fetchFn }).catch(() => {});
    }
    return { ok: true };
  }

  /** 인증이 필요한 호출 공통: 토큰 확인 → 호출 → 401 이면 토큰 삭제 */
  async function withAuth(fn) {
    const { server, error } = await readyServer();
    if (error) return { ok: false, error };
    const a = await currentAuth(server);
    if (!a) return authRequired('missing');
    const r = await fn(server, a.token);
    if (!r.ok && isAuthExpired(r.error)) {
      await clearAuth();
      return authRequired('expired');
    }
    return r;
  }

  /** 같은 영상 요청이 동시에 두 번 나가지 않게(팝업을 닫았다 열어도) */
  const inflight = new Map();

  async function detect({ tabId, force }) {
    const url = await getTabUrl(tabId).catch(() => undefined);
    const video = parseVideoUrl(url);
    if (!video) return { ok: false, error: { kind: 'not_video' } };
    const key = cacheKey(video);

    const r = await withAuth(async (server, token) => {
      if (!force) {
        const hit = (await session.get(key))[key];
        if (hit) return { ok: true, data: hit.data, fromCache: true, checkedAt: hit.at };
      }
      let p = inflight.get(key);
      if (!p) {
        p = (async () => {
          const res = await requestDetect({ origin: server.origin, url: video.url, token, fetchFn });
          // 세션 저장소: 브라우저를 닫으면 사라진다.
          if (res.ok) await session.set({ [key]: { data: res.data, at: now() } });
          return res;
        })().finally(() => inflight.delete(key));
        inflight.set(key, p);
      }
      const res = await p;
      return res.ok ? { ok: true, data: res.data, fromCache: false, checkedAt: now() } : res;
    });
    return { ...r, video };
  }

  function history({ limit } = {}) {
    return withAuth((server, token) => requestHistory({ origin: server.origin, token, limit, fetchFn }));
  }

  async function health() {
    const { server, error } = await readyServer();
    if (error) return { ok: false, error };
    const r = await requestHealth({ origin: server.origin, fetchFn });
    return { ...r, origin: server.origin };
  }

  return {
    status,
    login: (msg) => authenticate('login', msg),
    signup: (msg) => authenticate('signup', msg),
    logout,
    detect,
    history,
    health,
    clearAuth,
    getServer,
  };
}
