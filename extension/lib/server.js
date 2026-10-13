// 서버 주소 정규화와 권한 패턴 (순수 함수).

export const DEFAULT_SERVER = 'http://localhost:8000';

/** manifest host_permissions 에 이미 들어 있어 런타임 요청이 필요 없는 호스트 */
const BUILTIN_HOSTS = new Set(['localhost', '127.0.0.1']);

/**
 * 사용자가 입력한 서버 주소를 origin 으로 정규화한다.
 * "abc.trycloudflare.com" 처럼 scheme 이 없으면 https 를 붙인다(localhost 는 http).
 * @returns {{ origin: string, pattern: string, builtin: boolean } | null}
 *   pattern: chrome.permissions 용 match pattern (포트는 패턴에 넣지 않는다 — 크롬은 포트 무시)
 */
export function normalizeServer(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim();
  if (s === '') return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    const isLocal = /^(localhost|127\.0\.0\.1)(:|\/|$)/i.test(s);
    s = (isLocal ? 'http://' : 'https://') + s;
  }
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (!u.hostname) return null;
  const host = u.hostname.toLowerCase();
  return {
    origin: u.origin,
    pattern: `${u.protocol}//${host}/*`,
    builtin: BUILTIN_HOSTS.has(host),
  };
}

export function detectEndpoint(origin) {
  return `${origin}/v1/detect`;
}

export function healthEndpoint(origin) {
  return `${origin}/v1/health`;
}
