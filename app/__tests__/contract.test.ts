import { SAMPLE, SERVER_UPLOAD, SERVER_URL_PARTIAL } from './fixtures';
import {
  CONTRACT_ERROR_CODES,
  DEFAULT_UPLOAD_LIMITS,
  parseDetectResponse,
  parseErrorCode,
  parseUploadLimits,
  VERDICTS,
} from '../src/api/contract';


describe('parseDetectResponse', () => {
  it('계약 예시를 그대로 파싱한다 (값 변경 없음)', () => {
    expect(parseDetectResponse(SAMPLE)).toEqual(SAMPLE);
  });

  it('ai_probability=null, video_id=null, 빈 signals 허용', () => {
    const r = parseDetectResponse({ ...SAMPLE, ai_probability: null, video_id: null, verdict: 'unknown', signals: [] });
    expect(r?.ai_probability).toBeNull();
    expect(r?.verdict).toBe('unknown');
  });

  it.each(Object.keys(SAMPLE))('필수 필드 %s 누락 시 null', (k) => {
    const bad: Record<string, unknown> = { ...SAMPLE };
    delete bad[k];
    expect(parseDetectResponse(bad)).toBeNull();
  });

  it.each(Object.keys(SAMPLE.signals[0]))('signal 필드 %s 누락 시 null', (k) => {
    const sig: Record<string, unknown> = { ...SAMPLE.signals[0] };
    delete sig[k];
    expect(parseDetectResponse({ ...SAMPLE, signals: [sig] })).toBeNull();
  });

  it('camelCase로 바뀐 응답은 거부한다 (변환 레이어 금지)', () => {
    const { ai_probability, ...rest } = SAMPLE;
    expect(parseDetectResponse({ ...rest, aiProbability: ai_probability })).toBeNull();
  });

  it('계약에 없는 verdict 값은 거부', () => {
    expect(parseDetectResponse({ ...SAMPLE, verdict: 'fake' })).toBeNull();
  });

  it('verdict enum 4개, error code 7개 (계약 v1.1: invalid_file 추가)', () => {
    expect([...VERDICTS].sort()).toEqual(['likely_ai', 'likely_real', 'uncertain', 'unknown']);
    expect(CONTRACT_ERROR_CODES).toHaveLength(7);
    expect(CONTRACT_ERROR_CODES).toContain('invalid_file');
  });

  // QA 회귀(04_qa_report): 서버는 unavailable/error 신호의 score를 null로 보낸다.
  // v1 앱은 이를 거부해 영상 확보가 막힌 모든 URL 결과가 에러 화면이 됐다.
  it('score=null 신호(unavailable)를 허용한다 — 실제 서버 응답 (URL, partial)', () => {
    const r = parseDetectResponse(SERVER_URL_PARTIAL);
    expect(r).not.toBeNull();
    expect(r?.verdict).toBe('likely_ai');
    expect(r?.signals.filter((s) => s.score === null)).toHaveLength(2);
  });

  it('실제 서버 응답 (업로드) 파싱', () => {
    expect(parseDetectResponse(SERVER_UPLOAD)).toEqual(SERVER_UPLOAD);
  });

  it('score가 문자열이면 거부', () => {
    expect(parseDetectResponse({ ...SAMPLE, signals: [{ ...SAMPLE.signals[0], score: '1' }] })).toBeNull();
  });
});

describe('parseUploadLimits (v1.1)', () => {
  it('health.limits를 꺼낸다', () => {
    expect(parseUploadLimits({ status: 'ok', detectors: {}, limits: { max_upload_mb: 50.0, max_duration_s: 180.0 } }))
      .toEqual({ max_upload_mb: 50, max_duration_s: 180 });
  });
  it('없거나 형식이 다르면 기본값 50MB/180초', () => {
    expect(parseUploadLimits({ status: 'ok', detectors: {} })).toEqual(DEFAULT_UPLOAD_LIMITS);
    expect(parseUploadLimits({ limits: { max_upload_mb: '50' } })).toEqual(DEFAULT_UPLOAD_LIMITS);
    expect(parseUploadLimits(null)).toEqual(DEFAULT_UPLOAD_LIMITS);
    expect(DEFAULT_UPLOAD_LIMITS).toEqual({ max_upload_mb: 50, max_duration_s: 180 });
  });
});

describe('parseErrorCode', () => {
  it('error.code를 꺼낸다', () => {
    expect(parseErrorCode({ error: { code: 'invalid_url', message_ko: 'x' } })).toBe('invalid_url');
  });
  it('형식이 다르면 null', () => {
    expect(parseErrorCode({ detail: 'Not Found' })).toBeNull();
    expect(parseErrorCode(null)).toBeNull();
    expect(parseErrorCode('oops')).toBeNull();
  });
});
