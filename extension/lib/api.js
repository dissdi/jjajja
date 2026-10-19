// 서버 호출 (fetch 를 주입받아 테스트 가능). service worker 에서만 부른다.
// 토큰은 Authorization 헤더로만 보낸다(URL·로그에 남기지 않는다 — 계약 v2.0 "토큰").
import {
  DEVICE_NAME,
  EXTENSION_SOURCE,
  HISTORY_LIMIT,
  URL_TIMEOUT_MS,
  errorFromHttp,
  parseAuthResponse,
  parseDetectResponse,
  parseHistoryResponse,
} from './contract.js';
import { ENDPOINTS, detectEndpoint, healthEndpoint } from './server.js';

const AUTH_TIMEOUT_MS = 15_000;

/**
 * 공통 호출. 본문 파싱까지만 한다.
 * @returns {Promise<{ ok: true, status: number, body: any } | { ok: false, error: object }>}
 */
async function call({ url, method = 'GET', token = null, json, fetchFn = fetch, timeoutMs }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const headers = {};
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetchFn(url, {
      method,
      headers,
      body: json === undefined ? undefined : JSON.stringify(json),
      signal: ctrl.signal,
    });
  } catch {
    clearTimeout(timer);
    return { ok: false, error: { kind: ctrl.signal.aborted ? 'timeout' : 'network' } };
  }
  let body = null;
  if (res.status !== 204) {
    try {
      body = await res.json();
    } catch {
      if (ctrl.signal.aborted) {
        clearTimeout(timer);
        return { ok: false, error: { kind: 'timeout' } };
      }
      body = null;
    }
  }
  clearTimeout(timer);
  if (!res.ok) return { ok: false, error: errorFromHttp(res.status, body) };
  return { ok: true, status: res.status, body };
}

/** POST {origin}/v1/detect { url, source: "paste" } (Bearer) */
export async function requestDetect({ origin, url, token, fetchFn = fetch, timeoutMs = URL_TIMEOUT_MS }) {
  const r = await call({
    url: detectEndpoint(origin),
    method: 'POST',
    token,
    json: { url, source: EXTENSION_SOURCE },
    fetchFn,
    timeoutMs,
  });
  if (!r.ok) return r;
  const data = parseDetectResponse(r.body);
  return data ? { ok: true, data } : { ok: false, error: { kind: 'bad_response' } };
}

async function authCall(path, { origin, json, fetchFn, timeoutMs }) {
  const r = await call({ url: `${origin}${path}`, method: 'POST', json, fetchFn, timeoutMs });
  if (!r.ok) return r;
  const data = parseAuthResponse(r.body);
  return data ? { ok: true, data } : { ok: false, error: { kind: 'bad_response' } };
}

/** POST /v1/auth/login { email, password, device_name } → { token, email } */
export function requestLogin({ origin, email, password, fetchFn = fetch, timeoutMs = AUTH_TIMEOUT_MS }) {
  return authCall(ENDPOINTS.login, {
    origin,
    json: { email, password, device_name: DEVICE_NAME },
    fetchFn,
    timeoutMs,
  });
}

/** POST /v1/auth/signup { email, password, device_name } → { token, email } (가입 직후 토큰이 이 기기 토큰) */
export function requestSignup({ origin, email, password, fetchFn = fetch, timeoutMs = AUTH_TIMEOUT_MS }) {
  return authCall(ENDPOINTS.signup, {
    origin,
    json: { email, password, device_name: DEVICE_NAME },
    fetchFn,
    timeoutMs,
  });
}

/** POST /v1/auth/logout (Bearer) → 204. 실패해도 확장은 토큰을 지운다. */
export async function requestLogout({ origin, token, fetchFn = fetch, timeoutMs = 8000 }) {
  const r = await call({ url: `${origin}${ENDPOINTS.logout}`, method: 'POST', token, fetchFn, timeoutMs });
  return r.ok ? { ok: true } : r;
}

/** GET /v1/history?limit=10 (Bearer) */
export async function requestHistory({ origin, token, limit = HISTORY_LIMIT, fetchFn = fetch, timeoutMs = AUTH_TIMEOUT_MS }) {
  const r = await call({ url: `${origin}${ENDPOINTS.history}?limit=${limit}`, token, fetchFn, timeoutMs });
  if (!r.ok) return r;
  const data = parseHistoryResponse(r.body);
  return data ? { ok: true, data } : { ok: false, error: { kind: 'bad_response' } };
}

/** GET {origin}/v1/health — 옵션 페이지의 [연결 확인] (인증 불필요) */
export async function requestHealth({ origin, fetchFn = fetch, timeoutMs = 8000 }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchFn(healthEndpoint(origin), { signal: ctrl.signal });
    const body = await res.json().catch(() => null);
    return { ok: res.ok && body && body.status === 'ok', status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: null, timeout: ctrl.signal.aborted };
  } finally {
    clearTimeout(timer);
  }
}
