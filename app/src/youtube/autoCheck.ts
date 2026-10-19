// 앱 안 유튜브(시연) — 영상이 바뀌면 자동으로 확인하는 로직.
// - 새 영상 ID가 delayMs(기본 0.8초) 동안 유지되면 POST /v1/detect 호출 (빠르게 넘기는 중엔 요청 안 함)
// - 다른 영상으로 넘어가면 진행 중인 요청은 AbortController로 취소
// - 메모리 캐시(id → 결과): 다시 돌아온 영상은 재요청 없이 바로 표시
// React와 무관한 클래스(AutoChecker)로 두고 훅(useAutoCheck)은 얇게 감싼다 — 테스트: __tests__/autoCheck.test.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DetectOutcome } from '../api/client';
import type { DetectResponse } from '../api/contract';
import type { ErrorCode } from '../ux/copy';
import type { YoutubeVideo } from './videoId';

export const SETTLE_MS = 800;

export type CheckState =
  | { status: 'idle' }
  /** 영상은 정해졌고 머무르는지 기다리는 중 또는 서버 응답 대기 중 (화면에선 둘 다 "확인 중") */
  | { status: 'waiting' | 'loading'; video: YoutubeVideo }
  | { status: 'done'; video: YoutubeVideo; data: DetectResponse; fromCache: boolean }
  | { status: 'error'; video: YoutubeVideo; code: ErrorCode };

export type DetectFn = (url: string, signal: AbortSignal) => Promise<DetectOutcome>;

export interface AutoCheckerOptions {
  detect: DetectFn;
  onChange: (s: CheckState) => void;
  delayMs?: number;
  /** 테스트·공유용으로 주입 가능. 기본은 인스턴스 전용 Map */
  cache?: Map<string, DetectResponse>;
}

export class AutoChecker {
  private state: CheckState = { status: 'idle' };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: AbortController | null = null;
  private readonly cache: Map<string, DetectResponse>;
  private readonly delayMs: number;
  private disposed = false;

  constructor(private readonly opts: AutoCheckerOptions) {
    this.cache = opts.cache ?? new Map();
    this.delayMs = opts.delayMs ?? SETTLE_MS;
  }

  get current(): CheckState {
    return this.state;
  }

  /** WebView 주소가 바뀔 때마다 호출. 같은 영상이면 아무것도 하지 않는다 */
  setVideo(video: YoutubeVideo | null): void {
    if (this.disposed) return;
    const curId = this.state.status === 'idle' ? null : this.state.video.id;
    if ((video?.id ?? null) === curId) return;
    this.cancelPending();
    if (!video) return this.set({ status: 'idle' });
    const hit = this.cache.get(video.id);
    if (hit) return this.set({ status: 'done', video, data: hit, fromCache: true });
    this.set({ status: 'waiting', video });
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run(video);
    }, this.delayMs);
  }

  /** 현재 영상을 캐시 무시하고 다시 확인 (오류 후 [다시 해보기], unknown 후 [다시 확인하기]) */
  retry(): void {
    if (this.disposed || this.state.status === 'idle') return;
    const video = this.state.video;
    this.cancelPending();
    this.cache.delete(video.id);
    void this.run(video);
  }

  dispose(): void {
    this.cancelPending();
    this.disposed = true;
  }

  private async run(video: YoutubeVideo): Promise<void> {
    const ctrl = new AbortController();
    this.inflight = ctrl;
    this.set({ status: 'loading', video });
    let out: DetectOutcome;
    try {
      out = await this.opts.detect(video.url, ctrl.signal);
    } catch {
      out = { ok: false, code: 'unknown' };
    }
    if (ctrl.signal.aborted || this.inflight !== ctrl || this.disposed) return; // 다른 영상으로 넘어감
    this.inflight = null;
    if (out.ok) {
      this.cache.set(video.id, out.data);
      this.set({ status: 'done', video, data: out.data, fromCache: false });
    } else if (out.code === 'unauthorized') {
      // 401: 토큰은 이미 지워졌고 App이 로그인 화면으로 보낸다. 배지는 확인 전 상태로 되돌린다
      this.set({ status: 'idle' });
    } else if (out.code !== 'cancelled') {
      this.set({ status: 'error', video, code: out.code });
    }
  }

  private cancelPending(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.inflight?.abort();
    this.inflight = null;
  }

  private set(s: CheckState): void {
    this.state = s;
    this.opts.onChange(s);
  }
}

/**
 * 화면용 훅. detect·delayMs는 마운트 때의 것을 쓴다.
 * 캐시는 화면을 나갔다 들어와도 유지되도록 모듈 단위로 둔다(앱 프로세스 동안만, 메모리).
 */
const sessionCache = new Map<string, DetectResponse>();

export function useAutoCheck(detect: DetectFn, delayMs = SETTLE_MS, cache: Map<string, DetectResponse> = sessionCache) {
  const [state, setState] = useState<CheckState>({ status: 'idle' });
  const ref = useRef<AutoChecker | null>(null);
  useEffect(() => {
    // effect 안에서 만든다: StrictMode의 mount→cleanup→mount에서도 살아 있는 인스턴스가 남도록
    const c = new AutoChecker({ detect, onChange: setState, delayMs, cache });
    ref.current = c;
    return () => {
      c.dispose();
      if (ref.current === c) ref.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setVideo = useCallback((v: YoutubeVideo | null) => ref.current?.setVideo(v), []);
  const retry = useCallback(() => ref.current?.retry(), []);
  return { state, setVideo, retry };
}
