import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVideoUrl, cacheKey } from '../lib/video.js';
import { normalizeServer, DEFAULT_SERVER } from '../lib/server.js';

const ID = 'dQw4w9WgXcQ';

test('watch 주소는 영상으로 판별하고 정규화한다', () => {
  const v = parseVideoUrl(`https://www.youtube.com/watch?v=${ID}&list=PL123&t=42s`);
  assert.deepEqual(v, { platform: 'youtube', kind: 'watch', videoId: ID, url: `https://www.youtube.com/watch?v=${ID}` });
});

test('shorts 주소는 영상으로 판별한다', () => {
  for (const u of [`https://www.youtube.com/shorts/${ID}`, `https://m.youtube.com/shorts/${ID}?feature=share`, `https://youtube.com/shorts/${ID}/`]) {
    const v = parseVideoUrl(u);
    assert.equal(v?.kind, 'shorts', u);
    assert.equal(v.url, `https://www.youtube.com/shorts/${ID}`);
  }
});

test('영상이 아닌 유튜브 페이지는 null (버튼 꺼짐)', () => {
  for (const u of [
    'https://www.youtube.com/',
    'https://www.youtube.com/results?search_query=ai',
    'https://www.youtube.com/@channel',
    'https://www.youtube.com/watch',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/shorts/',
    'https://www.youtube.com/feed/subscriptions',
  ]) {
    assert.equal(parseVideoUrl(u), null, u);
  }
});

test('다른 사이트·잘못된 값은 null', () => {
  for (const u of [
    undefined,
    null,
    '',
    'not a url',
    `https://music.youtube.com/watch?v=${ID}`,
    `https://evil.com/watch?v=${ID}`,
    `https://youtube.com.evil.com/watch?v=${ID}`,
    `chrome://extensions`,
    `https://youtu.be/${ID}`,
  ]) {
    assert.equal(parseVideoUrl(u), null, String(u));
  }
});

test('watch/shorts 로 같은 영상이면 캐시 키가 같다', () => {
  const a = parseVideoUrl(`https://www.youtube.com/watch?v=${ID}`);
  const b = parseVideoUrl(`https://www.youtube.com/shorts/${ID}`);
  assert.equal(cacheKey(a), cacheKey(b));
});

test('서버 주소 정규화', () => {
  assert.deepEqual(normalizeServer(DEFAULT_SERVER), {
    origin: 'http://localhost:8000',
    pattern: 'http://localhost/*',
    builtin: true,
  });
  assert.deepEqual(normalizeServer(' https://abc-def.trycloudflare.com/ '), {
    origin: 'https://abc-def.trycloudflare.com',
    pattern: 'https://abc-def.trycloudflare.com/*',
    builtin: false,
  });
  assert.equal(normalizeServer('abc.trycloudflare.com').origin, 'https://abc.trycloudflare.com');
  assert.equal(normalizeServer('localhost:9000').origin, 'http://localhost:9000');
  assert.equal(normalizeServer('127.0.0.1:8000').builtin, true);
  assert.equal(normalizeServer('https://x.ngrok.app/v1/detect').origin, 'https://x.ngrok.app');
  assert.equal(normalizeServer(''), null);
  assert.equal(normalizeServer('ftp://x.com'), null);
  assert.equal(normalizeServer('http://'), null);
});
