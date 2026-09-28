// 탐지 서버 클라이언트. 계약: .claude/skills/detect-api-contract/SKILL.md (v1.1)
// 서버 주소: 환경변수 EXPO_PUBLIC_API_BASE (예: http://192.168.0.10:8000). 빌드(번들) 시점에 들어간다.

import { Platform } from 'react-native';
import {
  CONTRACT_ERROR_CODES,
  DEFAULT_UPLOAD_LIMITS,
  parseDetectResponse,
  parseErrorCode,
  parseUploadLimits,
  type ContractErrorCode,
  type DetectResponse,
  type DetectSource,
  type DetectUrlRequest,
  type UploadLimits,
} from './contract';
import type { ErrorCode } from '../ux/copy';

export const API_BASE: string = (process.env.EXPO_PUBLIC_API_BASE ?? 'http://localhost:8000').replace(/\/+$/, '');

/** UX 명세 A6: URL 확인 45초 */
export const URL_TIMEOUT_MS = 45_000;
/** 영상 파일은 전송 시간이 더해지므로 더 길게 (03_mobile_notes.md 참조) */
export const UPLOAD_TIMEOUT_MS = 120_000;

export type DetectOutcome =
  | { ok: true; data: DetectResponse }
  | { ok: false; code: ErrorCode }
  | { ok: false; code: 'cancelled' };

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

/** GET /v1/health 의 limits (v1.1). 실패/없음 → DEFAULT_UPLOAD_LIMITS */
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

/** HTTP 상태 + 본문 → 앱 에러 코드. 매핑 없는 code/파싱 실패/5xx(503 외) → unknown (UX 명세 §5.5) */
export function mapHttpError(status: number, body: unknown): ErrorCode {
  const code = parseErrorCode(body);
  if (code && (CONTRACT_ERROR_CODES as readonly string[]).includes(code)) return code as ContractErrorCode;
  if (!code && status === 503) return 'detectors_down';
  if (!code && status === 429) return 'rate_limited';
  return 'unknown';
}

async function request(
  path: string,
  init: RequestInit,
  timeoutMs: number,
  cancel?: AbortSignal,
): Promise<DetectOutcome> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onCancel = () => ctrl.abort();
  cancel?.addEventListener('abort', onCancel);
  try {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, { ...init, signal: ctrl.signal });
    } catch {
      if (cancel?.aborted) return { ok: false, code: 'cancelled' };
      return { ok: false, code: timedOut ? 'timeout' : 'network' };
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      if (cancel?.aborted) return { ok: false, code: 'cancelled' };
      if (timedOut) return { ok: false, code: 'timeout' };
      body = null;
    }
    if (!res.ok) return { ok: false, code: mapHttpError(res.status, body) };
    const data = parseDetectResponse(body);
    if (!data) return { ok: false, code: 'unknown' };
    return { ok: true, data };
  } finally {
    clearTimeout(timer);
    cancel?.removeEventListener('abort', onCancel);
  }
}

/** POST /v1/detect (JSON, URL 방식) */
export function detect(url: string, source: DetectSource, cancel?: AbortSignal): Promise<DetectOutcome> {
  const payload: DetectUrlRequest = { url, source };
  return request(
    '/v1/detect',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    },
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
  return request(
    '/v1/detect',
    // Content-Type은 지정하지 않는다 (boundary를 런타임이 채움)
    { method: 'POST', headers: { Accept: 'application/json' }, body: form },
    UPLOAD_TIMEOUT_MS,
    cancel,
  );
}
