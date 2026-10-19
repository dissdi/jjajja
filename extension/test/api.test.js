import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestDetect, requestLogout } from '../lib/api.js';

const okBody = {
  request_id: 'r',
  platform: 'youtube',
  video_id: 'dQw4w9WgXcQ',
  ai_probability: 0.2,
  verdict: 'likely_real',
  partial: false,
  signals: [],
  cached: false,
  analyzed_at: '',
};
const jsonRes = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('POST /v1/detect 에 {url, source:"paste"} 를 보낸다', async () => {
  let call;
  const r = await requestDetect({
    origin: 'https://abc.trycloudflare.com',
    url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    fetchFn: async (u, init) => {
      call = { u, init };
      return jsonRes(200, okBody);
    },
  });
  assert.equal(call.u, 'https://abc.trycloudflare.com/v1/detect');
  assert.equal(call.init.method, 'POST');
  assert.deepEqual(JSON.parse(call.init.body), { url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ', source: 'paste' });
  assert.equal(r.ok, true);
  assert.equal(r.data.verdict, 'likely_real');
});

test('에러 응답 → api 에러 code', async () => {
  const r = await requestDetect({
    origin: 'http://localhost:8000',
    url: 'u',
    fetchFn: async () => jsonRes(404, { error: { code: 'video_unavailable', message_ko: 'x' } }),
  });
  assert.deepEqual(r, { ok: false, error: { kind: 'api', status: 404, code: 'video_unavailable' } });
});

test('fetch 실패 → network, 형식 오류 → bad_response', async () => {
  const net = await requestDetect({ origin: 'http://x', url: 'u', fetchFn: async () => { throw new TypeError('Failed to fetch'); } });
  assert.deepEqual(net.error, { kind: 'network' });
  const bad = await requestDetect({ origin: 'http://x', url: 'u', fetchFn: async () => jsonRes(200, { hello: 1 }) });
  assert.deepEqual(bad.error, { kind: 'bad_response' });
  const html = await requestDetect({
    origin: 'http://x',
    url: 'u',
    fetchFn: async () => ({ ok: false, status: 502, json: async () => { throw new SyntaxError('bad json'); } }),
  });
  assert.deepEqual(html.error, { kind: 'api', status: 502, code: null });
});

test('제한 시간을 넘기면 timeout', async () => {
  const r = await requestDetect({
    origin: 'http://x',
    url: 'u',
    timeoutMs: 20,
    fetchFn: (u, init) =>
      new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }),
  });
  assert.deepEqual(r.error, { kind: 'timeout' });
});
