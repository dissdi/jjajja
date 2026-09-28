import { detect, mapHttpError, uploadVideo } from '../src/api/client';
import { SAMPLE } from './fixtures';

const mockFetch = (impl: (...a: unknown[]) => Promise<unknown>) => {
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(impl);
  return (globalThis as unknown as { fetch: jest.Mock }).fetch;
};
const jsonRes = (status: number, body: unknown) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });

describe('mapHttpError', () => {
  it.each([
    [400, 'invalid_url'],
    [422, 'unsupported_platform'],
    [404, 'video_unavailable'],
    [413, 'file_too_large'],
    [429, 'rate_limited'],
    [503, 'detectors_down'],
  ])('%p %s', (status, code) => {
    expect(mapHttpError(status, { error: { code, message_ko: '서버 문구' } })).toBe(code);
  });
  it('본문 없는 503/429', () => {
    expect(mapHttpError(503, null)).toBe('detectors_down');
    expect(mapHttpError(429, null)).toBe('rate_limited');
  });
  it('모르는 code, 500, FastAPI 기본 에러 → unknown', () => {
    expect(mapHttpError(400, { error: { code: 'new_code', message_ko: '' } })).toBe('unknown');
    expect(mapHttpError(500, null)).toBe('unknown');
    expect(mapHttpError(422, { detail: [{ msg: 'field required' }] })).toBe('unknown');
  });
});

describe('detect', () => {
  it('POST /v1/detect JSON {url, source} 전송, 200 파싱', async () => {
    const f = mockFetch(() => jsonRes(200, SAMPLE));
    const out = await detect('https://youtube.com/shorts/abc123', 'paste');
    expect(out).toEqual({ ok: true, data: SAMPLE });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/v1\/detect$/);
    expect(JSON.parse(init.body as string)).toEqual({ url: 'https://youtube.com/shorts/abc123', source: 'paste' });
  });
  it('계약과 다른 200 응답 → unknown', async () => {
    mockFetch(() => jsonRes(200, { verdict: 'likely_ai' }));
    expect(await detect('https://a.com/x', 'paste')).toEqual({ ok: false, code: 'unknown' });
  });
  it('서버 에러 코드 전달', async () => {
    mockFetch(() => jsonRes(422, { error: { code: 'unsupported_platform', message_ko: 'x' } }));
    expect(await detect('https://a.com/x', 'paste')).toEqual({ ok: false, code: 'unsupported_platform' });
  });
  it('fetch 실패 → network', async () => {
    mockFetch(() => Promise.reject(new TypeError('Network request failed')));
    expect(await detect('https://a.com/x', 'paste')).toEqual({ ok: false, code: 'network' });
  });
  it('사용자 취소 → cancelled', async () => {
    const ctrl = new AbortController();
    mockFetch((_u, init) => {
      const sig = (init as RequestInit).signal!;
      return new Promise((_, rej) => sig.addEventListener('abort', () => rej(new Error('aborted'))));
    });
    const p = detect('https://a.com/x', 'paste', ctrl.signal);
    ctrl.abort();
    expect(await p).toEqual({ ok: false, code: 'cancelled' });
  });
  it('45초 초과 → timeout', async () => {
    jest.useFakeTimers();
    mockFetch((_u, init) => {
      const sig = (init as RequestInit).signal!;
      return new Promise((_, rej) => sig.addEventListener('abort', () => rej(new Error('aborted'))));
    });
    const p = detect('https://a.com/x', 'paste');
    jest.advanceTimersByTime(45_000);
    expect(await p).toEqual({ ok: false, code: 'timeout' });
    jest.useRealTimers();
  });
});

describe('uploadVideo', () => {
  it('multipart: file 필드 + source=upload', async () => {
    const f = mockFetch(() => jsonRes(200, { ...SAMPLE, platform: 'upload', video_id: null }));
    const out = await uploadVideo({ uri: 'file:///v.mp4', name: 'v.mp4', mimeType: 'video/mp4' });
    expect(out.ok).toBe(true);
    const init = f.mock.calls[0][1] as RequestInit;
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('source')).toBe('upload');
    expect(form.get('file')).toBeTruthy();
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });
});
