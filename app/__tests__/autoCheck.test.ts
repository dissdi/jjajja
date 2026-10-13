import type { DetectOutcome } from '../src/api/client';
import type { DetectResponse } from '../src/api/contract';
import { AutoChecker, SETTLE_MS, type CheckState, type DetectFn } from '../src/youtube/autoCheck';
import { youtubeVideoFromUrl, type YoutubeVideo } from '../src/youtube/videoId';
import { SAMPLE } from './fixtures';

const v = (id: string): YoutubeVideo => youtubeVideoFromUrl(`https://m.youtube.com/shorts/${id}`)!;
const A = v('aaaaaaaaaaa');
const B = v('bbbbbbbbbbb');
const C = v('ccccccccccc');
const resp = (id: string, p = 0.9): DetectResponse => ({ ...(SAMPLE as DetectResponse), video_id: id, ai_probability: p });

/** 수동으로 끝낼 수 있는 detect 가짜. abort되면 실제 client처럼 cancelled로 끝난다 */
function fakeDetect() {
  const calls: { url: string; signal: AbortSignal; resolve: (o: DetectOutcome) => void }[] = [];
  const fn: DetectFn = (url, signal) =>
    new Promise<DetectOutcome>((resolve) => {
      calls.push({ url, signal, resolve });
      signal.addEventListener('abort', () => resolve({ ok: false, code: 'cancelled' }));
    });
  return { fn, calls };
}

function setup(cache?: Map<string, DetectResponse>) {
  const d = fakeDetect();
  const states: CheckState[] = [];
  const c = new AutoChecker({ detect: d.fn, onChange: (s) => states.push(s), cache });
  const last = () => states[states.length - 1];
  return { c, d, states, last };
}

const flush = () => Promise.resolve().then(() => Promise.resolve());

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('AutoChecker', () => {
  it('기본 머무름 시간은 0.8초', () => {
    expect(SETTLE_MS).toBe(800);
  });

  it('0.8초 머물러야 요청한다 (source는 client가 paste로 고정, 여기선 표준 주소만 받는다)', async () => {
    const { c, d, last } = setup();
    c.setVideo(A);
    expect(last()).toEqual({ status: 'waiting', video: A });
    jest.advanceTimersByTime(799);
    expect(d.calls).toHaveLength(0);
    jest.advanceTimersByTime(1);
    expect(d.calls.map((x) => x.url)).toEqual(['https://www.youtube.com/shorts/aaaaaaaaaaa']);
    expect(last()).toEqual({ status: 'loading', video: A });
    d.calls[0].resolve({ ok: true, data: resp('aaaaaaaaaaa') });
    await flush();
    expect(last()).toMatchObject({ status: 'done', video: A, fromCache: false });
  });

  it('빠르게 넘기면 지나간 영상은 요청하지 않는다 (디바운스)', () => {
    const { c, d } = setup();
    c.setVideo(A);
    jest.advanceTimersByTime(300);
    c.setVideo(B);
    jest.advanceTimersByTime(300);
    c.setVideo(C);
    jest.advanceTimersByTime(800);
    expect(d.calls.map((x) => x.url)).toEqual([C.url]);
  });

  it('같은 영상 주소가 반복돼도(주기 확인) 타이머를 다시 시작하지 않는다', () => {
    const { c, d } = setup();
    c.setVideo(A);
    jest.advanceTimersByTime(500);
    c.setVideo(v('aaaaaaaaaaa'));
    jest.advanceTimersByTime(300);
    expect(d.calls).toHaveLength(1);
  });

  it('요청 중에 넘기면 이전 요청을 취소하고, 늦게 온 이전 응답은 무시한다', async () => {
    const { c, d, states, last } = setup();
    c.setVideo(A);
    jest.advanceTimersByTime(800);
    const first = d.calls[0];
    c.setVideo(B);
    expect(first.signal.aborted).toBe(true);
    await flush();
    expect(states.some((s) => s.status === 'error')).toBe(false); // cancelled는 오류로 보이지 않는다
    expect(last()).toEqual({ status: 'waiting', video: B });
    first.resolve({ ok: true, data: resp('aaaaaaaaaaa') }); // 이미 끝났지만 혹시 와도
    await flush();
    expect(last()).toEqual({ status: 'waiting', video: B });
  });

  it('캐시: 돌아온 영상은 재요청 없이 즉시 결과', async () => {
    const { c, d, last } = setup();
    c.setVideo(A);
    jest.advanceTimersByTime(800);
    d.calls[0].resolve({ ok: true, data: resp('aaaaaaaaaaa', 0.42) });
    await flush();
    c.setVideo(B);
    c.setVideo(A);
    expect(last()).toMatchObject({ status: 'done', video: A, fromCache: true, data: { ai_probability: 0.42 } });
    jest.advanceTimersByTime(5000);
    expect(d.calls).toHaveLength(1);
  });

  it('공유 캐시를 주입하면 화면을 다시 열어도 재요청 없음', () => {
    const cache = new Map([[A.id, resp(A.id)]]);
    const { c, d, last } = setup(cache);
    c.setVideo(A);
    expect(last()).toMatchObject({ status: 'done', fromCache: true });
    expect(d.calls).toHaveLength(0);
  });

  it('오류는 캐시하지 않고, retry는 즉시 다시 요청한다', async () => {
    const { c, d, last } = setup();
    c.setVideo(A);
    jest.advanceTimersByTime(800);
    d.calls[0].resolve({ ok: false, code: 'network' });
    await flush();
    expect(last()).toEqual({ status: 'error', video: A, code: 'network' });
    c.retry();
    expect(d.calls).toHaveLength(2);
    expect(last()).toEqual({ status: 'loading', video: A });
    d.calls[1].resolve({ ok: true, data: resp('aaaaaaaaaaa') });
    await flush();
    expect(last()).toMatchObject({ status: 'done' });
  });

  it('retry는 캐시를 무시하고 새로 확인한다', async () => {
    const cache = new Map([[A.id, resp(A.id)]]);
    const { c, d } = setup(cache);
    c.setVideo(A);
    c.retry();
    expect(d.calls).toHaveLength(1);
    expect(cache.has(A.id)).toBe(false);
  });

  it('영상이 아닌 화면으로 가면 idle, 진행 중 요청 취소', () => {
    const { c, d, last } = setup();
    c.setVideo(A);
    jest.advanceTimersByTime(800);
    c.setVideo(null);
    expect(d.calls[0].signal.aborted).toBe(true);
    expect(last()).toEqual({ status: 'idle' });
  });

  it('detect가 throw해도 오류 상태로', async () => {
    const states: CheckState[] = [];
    const c = new AutoChecker({ detect: () => Promise.reject(new Error('x')), onChange: (s) => states.push(s) });
    c.setVideo(A);
    jest.advanceTimersByTime(800);
    await flush();
    expect(states[states.length - 1]).toEqual({ status: 'error', video: A, code: 'unknown' });
  });

  it('dispose 후에는 아무 것도 하지 않고 진행 중 요청을 취소한다', () => {
    const { c, d, states } = setup();
    c.setVideo(A);
    jest.advanceTimersByTime(800);
    c.dispose();
    expect(d.calls[0].signal.aborted).toBe(true);
    const n = states.length;
    c.setVideo(B);
    jest.advanceTimersByTime(800);
    expect(states).toHaveLength(n);
    expect(d.calls).toHaveLength(1);
  });
});
