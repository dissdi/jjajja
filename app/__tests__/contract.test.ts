import { SAMPLE } from './fixtures';
import { parseDetectResponse, parseErrorCode, VERDICTS, CONTRACT_ERROR_CODES } from '../src/api/contract';


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

  it('verdict enum 4개, error code 6개 (계약 v1)', () => {
    expect([...VERDICTS].sort()).toEqual(['likely_ai', 'likely_real', 'uncertain', 'unknown']);
    expect(CONTRACT_ERROR_CODES).toHaveLength(6);
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
