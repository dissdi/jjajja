// source: .claude/skills/detect-api-contract/SKILL.md (v2.0)
//
// 계약 문서의 응답 스키마를 확장에서 쓰는 만큼만 검사한다. 필드명은 snake_case 그대로.
// 확장이 필드를 새로 만들지 않는다. 요청 source 는 계약 값만 쓴다(확장은 "paste").

export const VERDICTS = ['likely_ai', 'uncertain', 'likely_real', 'unknown'];
export const ERROR_CODES = [
  'invalid_url',
  'unsupported_platform',
  'video_unavailable',
  'file_too_large',
  'rate_limited',
  'invalid_file',
  'detectors_down',
  // v2.0 인증
  'unauthorized',
  'invalid_credentials',
  'email_taken',
  'invalid_email',
  'weak_password',
  'not_found',
];
/** 계약 v2.0: 로그인할 때 보내는 기기 이름 (signup 도 선택 필드로 받는다) */
export const DEVICE_NAME = 'Chrome 확장';
/** 팝업 하단 [내 기록]에 보여줄 개수 */
export const HISTORY_LIMIT = 10;
/** 계약 v1.2: URL 경로 앱 제한 시간 45초 (서버 보장 40초) */
export const URL_TIMEOUT_MS = 45_000;
/** 계약 source 값 중 확장이 쓰는 값. 새 값을 만들지 않는다. */
export const EXTENSION_SOURCE = 'paste';

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumOrNull = (v) => v === null || (typeof v === 'number' && Number.isFinite(v));

function parseSignal(v) {
  if (!isObj(v)) return null;
  if (typeof v.id !== 'string') return null;
  if (typeof v.status !== 'string') return null;
  if (!isNumOrNull(v.score)) return null;
  if (typeof v.weight !== 'number') return null;
  const sig = {
    id: v.id,
    kind: typeof v.kind === 'string' ? v.kind : 'rule',
    status: v.status,
    decisive: v.decisive === true,
    score: v.score,
    weight: v.weight,
    evidence_ko: typeof v.evidence_ko === 'string' ? v.evidence_ko : '',
    via: typeof v.via === 'string' ? v.via : '',
    present: typeof v.present === 'boolean' ? v.present : null,
  };
  // v1.3 선택 필드: 개발 모드 서버만 보낸다. 없으면 넣지 않는다.
  if (isObj(v.debug)) {
    sig.debug = {
      reason: typeof v.debug.reason === 'string' ? v.debug.reason : null,
      raw: isObj(v.debug.raw) ? v.debug.raw : null,
    };
  }
  return sig;
}

/**
 * 200 응답 본문 검사. 형식이 맞지 않으면 null.
 * verdict 는 서버가 정한 값을 그대로 쓴다(확률로 재계산하지 않는다).
 */
export function parseDetectResponse(body) {
  if (!isObj(body)) return null;
  if (!VERDICTS.includes(body.verdict)) return null;
  if (!isNumOrNull(body.ai_probability)) return null;
  if (!Array.isArray(body.signals)) return null;
  const signals = [];
  for (const s of body.signals) {
    const p = parseSignal(s);
    if (!p) return null;
    signals.push(p);
  }
  return {
    request_id: typeof body.request_id === 'string' ? body.request_id : '',
    platform: typeof body.platform === 'string' ? body.platform : 'unknown',
    video_id: typeof body.video_id === 'string' ? body.video_id : null,
    ai_probability: body.ai_probability,
    verdict: body.verdict,
    partial: body.partial === true,
    signals,
    cached: body.cached === true,
    analyzed_at: typeof body.analyzed_at === 'string' ? body.analyzed_at : '',
  };
}

/**
 * HTTP 에러 응답 → 확장 내부 에러 객체.
 * 계약: { "error": { "code": "...", "message_ko": "..." } }
 */
export function errorFromHttp(status, body) {
  const code = isObj(body) && isObj(body.error) && typeof body.error.code === 'string' ? body.error.code : null;
  return { kind: 'api', status, code };
}

/**
 * signup(201)/login(200) 응답 { token, user: { id, email, created_at } }.
 * 토큰은 service worker 만 다룬다. 형식이 맞지 않으면 null.
 */
export function parseAuthResponse(body) {
  if (!isObj(body)) return null;
  if (typeof body.token !== 'string' || body.token === '') return null;
  if (!isObj(body.user) || typeof body.user.email !== 'string') return null;
  return { token: body.token, email: body.user.email };
}

function parseHistoryItem(v) {
  if (!isObj(v)) return null;
  if (typeof v.id !== 'string' && typeof v.id !== 'number') return null;
  return {
    id: String(v.id),
    checked_at: typeof v.checked_at === 'string' ? v.checked_at : '',
    source: typeof v.source === 'string' ? v.source : null, // v2.0 보완: null 가능
    platform: typeof v.platform === 'string' ? v.platform : 'unknown',
    video_id: typeof v.video_id === 'string' ? v.video_id : null,
    url: typeof v.url === 'string' && v.url !== '' ? v.url : null,
    verdict: VERDICTS.includes(v.verdict) ? v.verdict : 'unknown',
    ai_probability: typeof v.ai_probability === 'number' && Number.isFinite(v.ai_probability) ? v.ai_probability : null,
    device_name: typeof v.device_name === 'string' ? v.device_name : '',
  };
}

/** GET /v1/history 응답 { items: [...], next }. 항목 하나가 이상하면 그 항목만 버린다. */
export function parseHistoryResponse(body) {
  if (!isObj(body) || !Array.isArray(body.items)) return null;
  const items = body.items.map(parseHistoryItem).filter(Boolean);
  return { items, next: typeof body.next === 'string' ? body.next : null };
}
