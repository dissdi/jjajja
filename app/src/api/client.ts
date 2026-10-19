// 탐지 서버 클라이언트. 계약: .claude/skills/detect-api-contract/SKILL.md (v2.0 — 로그인 필수)
// 서버 주소: 환경변수 EXPO_PUBLIC_API_BASE (예: http://192.168.0.10:8000). 빌드(번들) 시점에 들어간다.
// /v1/health, /v1/auth/signup, /v1/auth/login 외 모든 요청에 `Authorization: Bearer <token>`을 붙인다.
// 그 요청이 401을 받으면 토큰을 지우고(session.expire) 'unauthorized'를 돌려준다 → App이 로그인 화면으로 보낸다.

import { Platform } from 'react-native';
import { expire, getToken } from '../auth/session';
import {
  AUTH_ERROR_CODES,
  CONTRACT_ERROR_CODES,
  DEFAULT_UPLOAD_LIMITS,
  HISTORY_MAX_LIMIT,
  parseAuthResponse,
  parseDetectResponse,
  parseErrorCode,
  parseHistoryResponse,
  parseMeResponse,
  parseUploadLimits,
  type AuthErrorCode,
  type AuthResponse,
  type ContractErrorCode,
  type DetectResponse,
  type DetectSource,
  type DetectUrlRequest,
  type HistoryResponse,
  type LoginRequest,
  type MeResponse,
  type SignupRequest,
  type UploadLimits,
} from './contract';
import type { ErrorCode } from '../ux/copy';

export const API_BASE: string = (process.env.EXPO_PUBLIC_API_BASE ?? 'http://localhost:8000').replace(/\/+$/, '');

/** 계약 v1.2 "응답 시간" 표: URL 앱 제한 45초 (서버 보장 40초 이내, #1). 바꾸려면 계약 표를 먼저 고친다 */
export const URL_TIMEOUT_MS = 45_000;
/** 계약 v1.2 "응답 시간" 표: 업로드 앱 제한 120초 (서버 처리 110초 이내 + 전송 시간). 바꾸려면 계약 표를 먼저 고친다 */
export const UPLOAD_TIMEOUT_MS = 120_000;
/** 로그인·기록·계정 요청 제한 시간 (계약에 정함 없음 — 짧은 DB 요청) */
export const AUTH_TIMEOUT_MS = 15_000;

export type DetectOutcome =
  | { ok: true; data: DetectResponse }
  | { ok: false; code: ErrorCode }
  | { ok: false; code: 'cancelled' }
  /** 401 — 토큰은 이미 지워졌다. 화면은 로그인으로 (진행 중이던 확인은 로그인 후 이어서) */
  | { ok: false; code: 'unauthorized' };

/** 로그인·기록·계정 요청 실패 코드 → copy.auth.error 문구 */
export type AuthFailCode = AuthErrorCode | 'rate_limited' | 'network' | 'timeout' | 'unknown';
export type AuthOutcome<T> = { ok: true; data: T } | { ok: false; code: AuthFailCode };

/** 업로드할 영상 (expo-image-picker asset에서 필요한 것만) */
export interface PickedVideo {
  uri: string;
  name: string;
  mimeType: string;
  /** web에서만 존재 */
  file?: Blob;
  /** 파일 크기(바이트). 모르면 undefined — 업로드 전 한도 검사용 (계약 v1.1) */
  sizeBytes?: number;
  /** 영상 길이(밀리초, expo-image-picker asset.duration). 모르면 undefined */
  durationMs?: number;
}

/** health 조회 타임아웃. 실패하면 계약 기본값(50MB/180초)으로 검사한다 */
const HEALTH_TIMEOUT_MS = 5_000;

/** GET /v1/health 의 limits (v1.1). 실패/없음 → DEFAULT_UPLOAD_LIMITS. 로그인 불필요 */
export async function getUploadLimits(): Promise<UploadLimits> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/v1/health`, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) return DEFAULT_UPLOAD_LIMITS;
    return parseUploadLimits(await res.json());
  } catch {
    return DEFAULT_UPLOAD_LIMITS;
  } finally {
    clearTimeout(timer);
  }
}

/** 업로드 전 한도 검사 (계약 v1.1). 크기·길이를 모르면 통과시키고 서버의 413에 맡긴다 */
export function exceedsUploadLimits(v: Pick<PickedVideo, 'sizeBytes' | 'durationMs'>, limits: UploadLimits): boolean {
  const tooBig = typeof v.sizeBytes === 'number' && v.sizeBytes > limits.max_upload_mb * 1024 * 1024;
  const tooLong = typeof v.durationMs === 'number' && v.durationMs / 1000 > limits.max_duration_s;
  return tooBig || tooLong;
}

/** HTTP 상태 + 본문 → 앱 에러 코드(탐지 경로). 매핑 없는 code/파싱 실패/5xx(503 외) → unknown (UX 명세 §5.5) */
export function mapHttpError(status: number, body: unknown): ErrorCode {
  const code = parseErrorCode(body);
  if (code && (CONTRACT_ERROR_CODES as readonly string[]).includes(code)) return code as ContractErrorCode;
  if (!code && status === 503) return 'detectors_down';
  if (!code && status === 429) return 'rate_limited';
  return 'unknown';
}

/** HTTP 상태 + 본문 → 로그인·기록 실패 코드 */
export function mapAuthError(status: number, body: unknown): AuthFailCode {
  const code = parseErrorCode(body);
  if (code && (AUTH_ERROR_CODES as readonly string[]).includes(code)) return code as AuthErrorCode;
  if (code === 'rate_limited' || (!code && status === 429)) return 'rate_limited';
  if (!code && status === 401) return 'unauthorized';
  if (!code && status === 404) return 'not_found';
  return 'unknown';
}

type Sent =
  | { kind: 'res'; status: number; ok: boolean; body: unknown }
  | { kind: 'fail'; code: 'network' | 'timeout' | 'cancelled' };

/**
 * fetch 한 번 + 제한 시간 + 사용자 취소. auth=true면 Bearer 헤더를 붙이고, 401이면 토큰을 지운다(expire).
 * 본문이 없거나 JSON이 아니면 body=null (204 포함).
 */
async function send(
  path: string,
  init: RequestInit,
  timeoutMs: number,
  opts: { auth: boolean; cancel?: AbortSignal },
): Promise<Sent> {
  const { auth, cancel } = opts;
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onCancel = () => ctrl.abort();
  cancel?.addEventListener('abort', onCancel);
  const headers: Record<string, string> = { Accept: 'application/json', ...(init.headers as Record<string, string>) };
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, { ...init, headers, signal: ctrl.signal });
    } catch {
      if (cancel?.aborted) return { kind: 'fail', code: 'cancelled' };
      return { kind: 'fail', code: timedOut ? 'timeout' : 'network' };
    }
    let body: unknown = null;
    if (res.status !== 204) {
      try {
        body = await res.json();
      } catch {
        if (cancel?.aborted) return { kind: 'fail', code: 'cancelled' };
        if (timedOut) return { kind: 'fail', code: 'timeout' };
        body = null;
      }
    }
    if (auth && res.status === 401) expire();
    return { kind: 'res', status: res.status, ok: res.ok, body };
  } finally {
    clearTimeout(timer);
    cancel?.removeEventListener('abort', onCancel);
  }
}

async function detectRequest(init: RequestInit, timeoutMs: number, cancel?: AbortSignal): Promise<DetectOutcome> {
  const r = await send('/v1/detect', init, timeoutMs, { auth: true, cancel });
  if (r.kind === 'fail') return { ok: false, code: r.code };
  if (r.status === 401) return { ok: false, code: 'unauthorized' };
  if (!r.ok) return { ok: false, code: mapHttpError(r.status, r.body) };
  const data = parseDetectResponse(r.body);
  if (!data) return { ok: false, code: 'unknown' };
  return { ok: true, data };
}

/** POST /v1/detect (JSON, URL 방식) */
export function detect(url: string, source: DetectSource, cancel?: AbortSignal): Promise<DetectOutcome> {
  const payload: DetectUrlRequest = { url, source };
  return detectRequest(
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    URL_TIMEOUT_MS,
    cancel,
  );
}

/** POST /v1/detect (multipart, 직접 영상): `file` 필드 + `source=upload` */
export async function uploadVideo(file: PickedVideo, cancel?: AbortSignal): Promise<DetectOutcome> {
  // 큰 영상을 끝까지 보낸 뒤에야 413을 받지 않도록, 크기/길이를 알면 먼저 거른다 (계약 v1.1)
  if (typeof file.sizeBytes === 'number' || typeof file.durationMs === 'number') {
    const limits = await getUploadLimits();
    if (cancel?.aborted) return { ok: false, code: 'cancelled' };
    if (exceedsUploadLimits(file, limits)) return { ok: false, code: 'file_too_large' };
  }
  const form = new FormData();
  if (Platform.OS === 'web' && file.file) {
    form.append('file', file.file, file.name);
  } else {
    // React Native의 FormData는 {uri, name, type} 객체를 파일로 전송한다
    form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  }
  form.append('source', 'upload' satisfies DetectSource);
  // Content-Type은 지정하지 않는다 (boundary를 런타임이 채움)
  return detectRequest({ method: 'POST', body: form }, UPLOAD_TIMEOUT_MS, cancel);
}

// ---------------------------------------------------------------------------
// 인증·계정·기록 (계약 v2.0)
// ---------------------------------------------------------------------------

async function authJson<T>(
  path: string,
  init: RequestInit,
  parse: ((body: unknown) => T | null) | null,
  auth: boolean,
): Promise<AuthOutcome<T>> {
  const r = await send(path, init, AUTH_TIMEOUT_MS, { auth });
  if (r.kind === 'fail') return { ok: false, code: r.code === 'cancelled' ? 'unknown' : r.code };
  if (!r.ok) return { ok: false, code: mapAuthError(r.status, r.body) };
  if (parse === null) return { ok: true, data: undefined as T };
  const data = parse(r.body);
  return data === null ? { ok: false, code: 'unknown' } : { ok: true, data };
}

const jsonPost = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** POST /v1/auth/signup → 201 {token, user}. device_name을 넣어 가입 직후 토큰도 이 기기 토큰이 되게 한다 (v2.0 보완) */
export function signup(email: string, password: string, device_name: string): Promise<AuthOutcome<AuthResponse>> {
  const payload: SignupRequest = { email, password, device_name };
  return authJson('/v1/auth/signup', jsonPost(payload), parseAuthResponse, false);
}

/** POST /v1/auth/login → 200 {token, user}. 틀리면 401 invalid_credentials (토큰을 지우지 않는다) */
export function login(email: string, password: string, device_name: string): Promise<AuthOutcome<AuthResponse>> {
  const payload: LoginRequest = { email, password, device_name };
  return authJson('/v1/auth/login', jsonPost(payload), parseAuthResponse, false);
}

/** POST /v1/auth/logout → 204 (현재 토큰만 폐기) */
export function logout(): Promise<AuthOutcome<void>> {
  return authJson<void>('/v1/auth/logout', { method: 'POST' }, null, true);
}

/** GET /v1/me → 사용자 + 로그인된 기기 목록 */
export function getMe(): Promise<AuthOutcome<MeResponse>> {
  return authJson('/v1/me', { method: 'GET' }, parseMeResponse, true);
}

export const HISTORY_PAGE_SIZE = 20;

/** GET /v1/history?limit=&before= → 최신순 기록 + 다음 커서 */
export function getHistory(before: string | null = null, limit = HISTORY_PAGE_SIZE): Promise<AuthOutcome<HistoryResponse>> {
  const q = new URLSearchParams({ limit: String(Math.min(limit, HISTORY_MAX_LIMIT)) });
  if (before) q.set('before', before);
  return authJson(`/v1/history?${q.toString()}`, { method: 'GET' }, parseHistoryResponse, true);
}

/** DELETE /v1/history/{id} → 204. 없거나 남의 기록이면 404 not_found */
export function deleteHistory(id: string): Promise<AuthOutcome<void>> {
  return authJson<void>(`/v1/history/${encodeURIComponent(id)}`, { method: 'DELETE' }, null, true);
}
