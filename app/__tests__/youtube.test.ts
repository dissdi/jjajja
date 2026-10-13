import type { DetectResponse } from '../src/api/contract';
import { copy } from '../src/ux/copy';
import type { CheckState } from '../src/youtube/autoCheck';
import { badgeFor, clampBadgePos } from '../src/youtube/badge';
import { BRIDGE_MESSAGE_TYPE, INJECTED_JS, isAllowedInWebView, parseBridgeMessage } from '../src/youtube/bridge';
import { youtubeVideoFromUrl } from '../src/youtube/videoId';
import { SAMPLE } from './fixtures';

const ID = 'dQw4w9WgXcQ';

describe('youtubeVideoFromUrl', () => {
  it.each([
    `https://m.youtube.com/shorts/${ID}`,
    `https://m.youtube.com/shorts/${ID}/`,
    `https://www.youtube.com/shorts/${ID}?feature=share`,
    `https://youtube.com/shorts/${ID}#t=3`,
    `http://m.youtube.com/shorts/${ID}?si=abc&pp=xyz`,
  ])('쇼츠: %s', (u) => {
    expect(youtubeVideoFromUrl(u)).toEqual({ id: ID, kind: 'shorts', url: `https://www.youtube.com/shorts/${ID}` });
  });

  it.each([
    `https://m.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?feature=x&v=${ID}&t=10`,
    `https://youtu.be/${ID}?si=1`,
  ])('일반 영상: %s', (u) => {
    expect(youtubeVideoFromUrl(u)).toEqual({ id: ID, kind: 'watch', url: `https://www.youtube.com/watch?v=${ID}` });
  });

  it.each([
    'https://m.youtube.com/',
    'https://m.youtube.com/shorts',
    'https://m.youtube.com/shorts/',
    'https://m.youtube.com/shorts/short',
    `https://m.youtube.com/shorts/${ID}/comments`,
    'https://m.youtube.com/results?search_query=cat',
    `https://m.youtube.com/@channel/shorts`,
    `https://m.youtube.com/watch?vv=${ID}`,
    `https://evil.com/shorts/${ID}`,
    `https://notyoutube.com/shorts/${ID}`,
    `https://accounts.google.com/?continue=https://m.youtube.com/shorts/${ID}`,
    '',
    null,
    undefined,
  ])('영상 아님: %s', (u) => {
    expect(youtubeVideoFromUrl(u)).toBeNull();
  });
});

describe('bridge', () => {
  it('우리 메시지만 주소로 꺼낸다', () => {
    const u = `https://m.youtube.com/shorts/${ID}`;
    expect(parseBridgeMessage(JSON.stringify({ type: BRIDGE_MESSAGE_TYPE, url: u, reason: 'poll' }))).toBe(u);
    expect(parseBridgeMessage(JSON.stringify({ type: 'other', url: u }))).toBeNull();
    expect(parseBridgeMessage(JSON.stringify({ type: BRIDGE_MESSAGE_TYPE }))).toBeNull();
    expect(parseBridgeMessage('not json')).toBeNull();
    expect(parseBridgeMessage(undefined)).toBeNull();
    expect(parseBridgeMessage('null')).toBeNull();
  });

  it('앱 열기 주소(intent://, vnd.youtube:)는 막는다', () => {
    expect(isAllowedInWebView('https://m.youtube.com/shorts/x')).toBe(true);
    expect(isAllowedInWebView('about:blank')).toBe(true);
    expect(isAllowedInWebView('intent://m.youtube.com#Intent;scheme=vnd.youtube;end')).toBe(false);
    expect(isAllowedInWebView('vnd.youtube://dQw4w9WgXcQ')).toBe(false);
    expect(isAllowedInWebView('youtube://x')).toBe(false);
  });

  it('주입 스크립트: history 후킹 + 주기 확인 + 같은 주소 중복 전송 안 함', () => {
    // 브라우저 흉내 환경에서 실제로 실행해 본다
    const posted: string[] = [];
    let href = 'https://m.youtube.com/shorts/aaaaaaaaaaa';
    const listeners: Record<string, () => void> = {};
    const intervals: (() => void)[] = [];
    const win: Record<string, unknown> = {
      ReactNativeWebView: { postMessage: (m: string) => posted.push(m) },
      addEventListener: (ev: string, fn: () => void) => (listeners[ev] = fn),
    };
    const hist = {
      pushState: (_s: unknown, _t: string, u: string) => (href = u),
      replaceState: (_s: unknown, _t: string, u: string) => (href = u),
    };
    const loc = { get href() { return href; } };
    const timeouts: (() => void)[] = [];
    // eslint-disable-next-line no-new-func
    const run = new Function('window', 'history', 'location', 'setInterval', 'setTimeout', INJECTED_JS);
    run(win, hist, loc, (fn: () => void) => intervals.push(fn), (fn: () => void) => timeouts.push(fn));
    const urls = () => posted.map((p) => JSON.parse(p).url);
    expect(urls()).toEqual(['https://m.youtube.com/shorts/aaaaaaaaaaa']);

    hist.pushState(null, '', 'https://m.youtube.com/shorts/bbbbbbbbbbb');
    timeouts.splice(0).forEach((f) => f());
    expect(urls()).toEqual(['https://m.youtube.com/shorts/aaaaaaaaaaa', 'https://m.youtube.com/shorts/bbbbbbbbbbb']);

    intervals.forEach((f) => f()); // 주소 그대로 → 전송 없음
    expect(posted).toHaveLength(2);

    href = 'https://m.youtube.com/shorts/ccccccccccc'; // 후킹 밖의 변화 → 주기 확인이 잡는다
    intervals.forEach((f) => f());
    expect(urls()[2]).toBe('https://m.youtube.com/shorts/ccccccccccc');

    // 두 번 주입돼도 다시 설치하지 않는다
    run(win, hist, loc, (fn: () => void) => intervals.push(fn), (fn: () => void) => timeouts.push(fn));
    expect(intervals).toHaveLength(1);
  });
});

describe('badgeFor', () => {
  const video = { id: ID, kind: 'shorts' as const, url: `https://www.youtube.com/shorts/${ID}` };
  const data = (o: Partial<DetectResponse>): DetectResponse => ({ ...(SAMPLE as DetectResponse), ...o });
  const done = (o: Partial<DetectResponse>): CheckState => ({ status: 'done', video, data: data(o), fromCache: false });

  it('영상 아님 → 숨김, 대기·요청 중 → 확인 중', () => {
    expect(badgeFor({ status: 'idle' })).toEqual({ kind: 'hidden' });
    expect(badgeFor({ status: 'waiting', video }).kind).toBe('checking');
    expect(badgeFor({ status: 'loading', video })).toMatchObject({ kind: 'checking', label: copy.youtube.badgeChecking });
  });

  it('결과 → 서버 verdict 그대로 + "AI 가능성 n%" 한 줄, 읽어주기는 헤드라인 포함', () => {
    const b = badgeFor(done({ verdict: 'likely_ai', ai_probability: 0.93 }));
    expect(b).toEqual({
      kind: 'result',
      verdict: 'likely_ai',
      label: 'AI 가능성 93%',
      a11yLabel: `${copy.result.verdict.likely_ai.headline}. AI 가능성 93%`,
    });
    // 확률로 verdict를 다시 계산하지 않는다
    expect(badgeFor(done({ verdict: 'uncertain', ai_probability: 0.9 }))).toMatchObject({ verdict: 'uncertain', label: 'AI 가능성 90%' });
  });

  it('unknown / 주소만으로 확인 어려움 → 퍼센트 없이 "확인하지 못했어요"', () => {
    expect(badgeFor(done({ verdict: 'unknown', ai_probability: null }))).toMatchObject({ verdict: 'unknown', label: copy.youtube.badgeUnknown });
    const lo = badgeFor(done({ verdict: 'unknown', ai_probability: null, partial: true, platform: 'youtube' }));
    expect(lo).toMatchObject({ label: copy.youtube.badgeUnknown, a11yLabel: copy.result.linkOnly.headline });
  });

  it('오류 → error', () => {
    expect(badgeFor({ status: 'error', video, code: 'network' })).toMatchObject({ kind: 'error', label: copy.youtube.badgeError });
  });
});

describe('clampBadgePos', () => {
  const area = { width: 400, height: 800 };
  const badge = { width: 180, height: 48 };
  it('영역 안으로 자른다', () => {
    expect(clampBadgePos({ right: -50, top: -10 }, area, badge)).toEqual({ right: 4, top: 4 });
    expect(clampBadgePos({ right: 999, top: 999 }, area, badge)).toEqual({ right: 216, top: 748 });
    expect(clampBadgePos({ right: 30, top: 100 }, area, badge)).toEqual({ right: 30, top: 100 });
  });
  it('크기를 아직 모르면 그대로', () => {
    expect(clampBadgePos({ right: -5, top: 2000 }, { width: 0, height: 0 }, badge)).toEqual({ right: -5, top: 2000 });
  });
});
