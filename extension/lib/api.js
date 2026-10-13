// 서버 호출 (fetch 를 주입받아 테스트 가능). service worker 에서만 부른다.
import { EXTENSION_SOURCE, URL_TIMEOUT_MS, errorFromHttp, parseDetectResponse } from './contract.js';
import { detectEndpoint, healthEndpoint } from './server.js';

/**
 * POST {origin}/v1/detect { url, source: "paste" }
 * @returns {Promise<{ ok: true, data: object } | { ok: false, error: object }>}
 */
export async function requestDetect({ origin, url, fetchFn = fetch, timeoutMs = URL_TIMEOUT_MS }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetchFn(detectEndpoint(origin), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, source: EXTENSION_SOURCE }),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: { kind: ctrl.signal.aborted ? 'timeout' : 'network' } };
  }
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    if (ctrl.signal.aborted) {
      clearTimeout(timer);
      return { ok: false, error: { kind: 'timeout' } };
    }
    body = null;
  }
  clearTimeout(timer);
  if (!res.ok) return { ok: false, error: errorFromHttp(res.status, body) };
  const data = parseDetectResponse(body);
  if (!data) return { ok: false, error: { kind: 'bad_response' } };
  return { ok: true, data };
}

/** GET {origin}/v1/health — 옵션 페이지의 [연결 확인] */
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
