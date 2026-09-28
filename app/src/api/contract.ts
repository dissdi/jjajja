// source: .claude/skills/detect-api-contract/SKILL.md (v1.1)
//
// 이 파일은 계약 문서의 스키마를 그대로 옮긴 것이다. 필드명은 snake_case 그대로 쓴다
// (변환 레이어 금지). 필드를 바꾸려면 계약 문서를 먼저 고치고 이 파일을 맞춘다.
// 앱이 직접 필드를 추가하지 않는다.

/** 요청 source — 진입 경로 (분석·통계용, 판정에 영향 없음) */
export type DetectSource = 'paste' | 'share' | 'clipboard' | 'upload';

/** POST /v1/detect 요청 (JSON, URL 방식) */
export interface DetectUrlRequest {
  url: string;
  source: DetectSource;
}
// multipart(직접 영상) 요청: `file` 필드 + `source=upload` — client.ts 참조

export type Platform = 'youtube' | 'tiktok' | 'instagram' | 'unknown' | 'upload';

export type Verdict = 'likely_ai' | 'uncertain' | 'likely_real' | 'unknown';
export const VERDICTS: readonly Verdict[] = ['likely_ai', 'uncertain', 'likely_real', 'unknown'];

export type SignalKind = 'rule' | 'model';
export type SignalStatus = 'ok' | 'error' | 'unavailable';
export type SignalVia = 'api' | 'oembed' | 'html' | 'model';

export interface Signal {
  id: string;
  kind: SignalKind;
  status: SignalStatus;
  decisive: boolean;
  /** 0.0~1.0. status가 ok가 아니면(unavailable/error) null (v1.1 명시) */
  score: number | null;
  weight: number;
  evidence_ko: string;
  via: SignalVia;
}

/** POST /v1/detect 응답 200 */
export interface DetectResponse {
  request_id: string;
  platform: Platform;
  video_id: string | null;
  /** 0.0~1.0. 계산 불가 시에만 null */
  ai_probability: number | null;
  /** 서버가 구간표로 결정. 앱은 확률로 재계산하지 않는다 */
  verdict: Verdict;
  partial: boolean;
  signals: Signal[];
  cached: boolean;
  analyzed_at: string;
}

/** GET /v1/health */
export interface HealthResponse {
  status: 'ok';
  detectors: Record<string, 'ok' | 'down'>;
  /** v1.1 (선택 필드). 없으면 DEFAULT_UPLOAD_LIMITS */
  limits?: UploadLimits;
}

/** 업로드 한도 (v1.1) — 앱은 업로드 전에 이 값으로 거른다 */
export interface UploadLimits {
  max_upload_mb: number;
  max_duration_s: number;
}
export const DEFAULT_UPLOAD_LIMITS: UploadLimits = { max_upload_mb: 50, max_duration_s: 180 };

/** GET /v1/health 본문에서 limits만 꺼낸다. 없거나 형식이 다르면 기본값 */
export function parseUploadLimits(v: unknown): UploadLimits {
  if (!isObj(v) || !isObj(v.limits)) return DEFAULT_UPLOAD_LIMITS;
  const { max_upload_mb, max_duration_s } = v.limits;
  if (typeof max_upload_mb !== 'number' || typeof max_duration_s !== 'number') return DEFAULT_UPLOAD_LIMITS;
  if (!(max_upload_mb > 0) || !(max_duration_s > 0)) return DEFAULT_UPLOAD_LIMITS;
  return { max_upload_mb, max_duration_s };
}

/** 에러 응답 code (계약) */
export type ContractErrorCode =
  | 'invalid_url'
  | 'unsupported_platform'
  | 'video_unavailable'
  | 'file_too_large'
  | 'rate_limited'
  | 'invalid_file'
  | 'detectors_down';
export const CONTRACT_ERROR_CODES: readonly ContractErrorCode[] = [
  'invalid_url',
  'unsupported_platform',
  'video_unavailable',
  'file_too_large',
  'rate_limited',
  'invalid_file',
  'detectors_down',
];

export interface ErrorResponse {
  error: { code: string; message_ko: string };
}

// ---------------------------------------------------------------------------
// 런타임 검증 — 필드 누락·오타를 조용히 넘기지 않고 파싱 실패로 드러낸다.
// (필드 이름은 위 타입과 같다. 값을 바꾸거나 계산하지 않는다.)
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function parseSignal(v: unknown): Signal | null {
  if (!isObj(v)) return null;
  if (typeof v.id !== 'string') return null;
  if (v.kind !== 'rule' && v.kind !== 'model') return null;
  if (v.status !== 'ok' && v.status !== 'error' && v.status !== 'unavailable') return null;
  if (typeof v.decisive !== 'boolean') return null;
  if (!(v.score === null || typeof v.score === 'number') || typeof v.weight !== 'number') return null;
  if (typeof v.evidence_ko !== 'string') return null;
  if (typeof v.via !== 'string') return null;
  return {
    id: v.id,
    kind: v.kind,
    status: v.status,
    decisive: v.decisive,
    score: v.score,
    weight: v.weight,
    evidence_ko: v.evidence_ko,
    via: v.via as SignalVia,
  };
}

/** 200 응답 본문 검증. 계약과 다르면 null. */
export function parseDetectResponse(v: unknown): DetectResponse | null {
  if (!isObj(v)) return null;
  if (typeof v.request_id !== 'string') return null;
  if (typeof v.platform !== 'string') return null;
  if (!(v.video_id === null || typeof v.video_id === 'string')) return null;
  if (!(v.ai_probability === null || typeof v.ai_probability === 'number')) return null;
  if (!VERDICTS.includes(v.verdict as Verdict)) return null;
  if (typeof v.partial !== 'boolean') return null;
  if (!Array.isArray(v.signals)) return null;
  const signals: Signal[] = [];
  for (const s of v.signals) {
    const parsed = parseSignal(s);
    if (!parsed) return null;
    signals.push(parsed);
  }
  if (typeof v.cached !== 'boolean') return null;
  if (typeof v.analyzed_at !== 'string') return null;
  return {
    request_id: v.request_id,
    platform: v.platform as Platform,
    video_id: v.video_id as string | null,
    ai_probability: v.ai_probability as number | null,
    verdict: v.verdict as Verdict,
    partial: v.partial,
    signals,
    cached: v.cached,
    analyzed_at: v.analyzed_at,
  };
}

/** 에러 응답 본문에서 code만 꺼낸다. 형식이 다르면 null. message_ko는 화면에 쓰지 않는다(UX 명세 §2.4). */
export function parseErrorCode(v: unknown): string | null {
  if (!isObj(v) || !isObj(v.error)) return null;
  return typeof v.error.code === 'string' ? v.error.code : null;
}
