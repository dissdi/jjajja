// 탐지 서버 클라이언트. 계약: .claude/skills/detect-api-contract/SKILL.md (v1)
// 서버 주소: 환경변수 EXPO_PUBLIC_API_BASE (예: http://192.168.0.10:8000). 빌드(번들) 시점에 들어간다.

import { Platform } from 'react-native';
import {
  CONTRACT_ERROR_CODES,
  parseDetectResponse,
  parseErrorCode,
  type ContractErrorCode,
  type DetectResponse,
  type DetectSource,
  type DetectUrlRequest,
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
export function uploadVideo(file: PickedVideo, cancel?: AbortSignal): Promise<DetectOutcome> {
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
