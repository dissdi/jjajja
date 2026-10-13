// 공유하기로 탐지 + 다시 보내기 (GitHub #12 기능 3)
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';
import App from '../App';
import type { DetectResponse, Verdict } from '../src/api/contract';
import { decideShareEntry, originalLinkFrom, sharedTextFrom } from '../src/capture/share';
import { ResultScreen } from '../src/screens/ResultScreen';
import { copy } from '../src/ux/copy';
import { buildShareText } from '../src/ux/present';
import { SAMPLE } from './fixtures';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn() }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: () => {} }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

// 네이티브 공유 수신을 흉내 낸다: 테스트가 mockIntent를 채우면 앱이 공유로 열린 것과 같다
const mockReset = jest.fn();
let mockIntent: { text: string | null; webUrl: string | null } | null = null;
jest.mock('expo-share-intent', () => ({
  useShareIntent: () => ({
    isReady: true,
    hasShareIntent: mockIntent !== null,
    shareIntent: mockIntent ?? { text: null, webUrl: null, files: null, type: null },
    resetShareIntent: () => {
      mockReset();
    },
    error: null,
  }),
}));

const YT_SHARE = '할머니가 하늘을 나는 영상 #shorts https://youtube.com/shorts/abc123?si=XyZ';
const KAKAO_SHARE = 'https://kko.to/AbCd12';
const data = (o: Partial<DetectResponse>): DetectResponse => ({ ...(SAMPLE as DetectResponse), ...o });
const noop = () => {};

beforeEach(() => {
  mockIntent = null;
  mockReset.mockClear();
});

describe('공유로 받은 텍스트 처리', () => {
  it('유튜브 공유 문구(제목+주소)는 다듬지 않고 그대로', () => {
    expect(sharedTextFrom({ text: `  ${YT_SHARE}\n`, webUrl: null })).toBe(YT_SHARE);
  });
  it('카카오톡 단축 링크도 그대로 (해석은 서버 몫)', () => {
    expect(sharedTextFrom({ text: KAKAO_SHARE, webUrl: KAKAO_SHARE })).toBe(KAKAO_SHARE);
  });
  it('iOS: 링크만 오면 webUrl', () => {
    expect(sharedTextFrom({ text: null, webUrl: 'https://youtu.be/abc' })).toBe('https://youtu.be/abc');
  });
  it('iOS: 제목만 text, 주소는 webUrl → 이어 붙여 서버가 주소를 찾게', () => {
    expect(sharedTextFrom({ text: '재밌는 영상', webUrl: 'https://youtu.be/abc' })).toBe('재밌는 영상 https://youtu.be/abc');
  });
  it('보낼 게 없으면 null', () => {
    expect(sharedTextFrom({ text: '   ', webUrl: null })).toBeNull();
    expect(sharedTextFrom(null)).toBeNull();
  });
  it('원래 링크: 공유 문구에서 첫 주소만, 단축 링크는 그대로, 없으면 원문', () => {
    expect(originalLinkFrom(YT_SHARE)).toBe('https://youtube.com/shorts/abc123?si=XyZ');
    expect(originalLinkFrom(KAKAO_SHARE)).toBe(KAKAO_SHARE);
    expect(originalLinkFrom(' 주소 없는 글 ')).toBe('주소 없는 글');
  });
});

describe('공유 진입 결정', () => {
  it('공유 없음 → 무시', () => {
    expect(decideShareEntry(false, { text: YT_SHARE }, null)).toEqual({ kind: 'ignore' });
  });
  it('새 공유 → 바로 확인', () => {
    expect(decideShareEntry(true, { text: YT_SHARE }, null)).toEqual({ kind: 'run', text: YT_SHARE });
  });
  it('방금 처리한 같은 공유가 다시 들어옴 → 무시 (요청 두 번 방지)', () => {
    expect(decideShareEntry(true, { text: YT_SHARE }, YT_SHARE)).toEqual({ kind: 'ignore' });
  });
  it('다른 공유 → 확인', () => {
    expect(decideShareEntry(true, { text: KAKAO_SHARE }, YT_SHARE)).toEqual({ kind: 'run', text: KAKAO_SHARE });
  });
  it('텍스트 없는 공유 → 무시', () => {
    expect(decideShareEntry(true, { text: '' , webUrl: null }, null)).toEqual({ kind: 'ignore' });
  });
});

describe('다시 보내기 문구 (verdict 4종)', () => {
  const link = 'https://youtube.com/shorts/abc123?si=XyZ';
  it.each<[Verdict, string]>([
    ['likely_ai', copy.share.verdictLine.likely_ai],
    ['uncertain', copy.share.verdictLine.uncertain],
    ['likely_real', copy.share.verdictLine.likely_real],
  ])('%s: 헤드라인 + 받는 사람 문장 + 링크 + jjajja 꼬리', (v, line) => {
    const t = buildShareText(data({ verdict: v }), link)!;
    expect(t).toContain(copy.result.verdict[v].headline);
    expect(t).toContain(line);
    expect(t).toContain(`영상 주소: ${link}`);
    expect(t.trim().endsWith('※ jjajja로 확인했어요. 자동으로 확인한 결과라 틀릴 수 있어요')).toBe(true);
    expect(t).not.toContain('{');
  });
  it('단정하지 않는다: "가짜", "진짜 영상" 같은 말 없음', () => {
    for (const v of ['likely_ai', 'uncertain', 'likely_real'] as const) {
      const t = buildShareText(data({ verdict: v }), 'https://youtu.be/x')!;
      expect(t).not.toMatch(/가짜|진짜 영상|확실히 AI|AI 영상입니다/);
    }
  });
  it('unknown → 보낼 문구 없음 (버튼 숨김)', () => {
    expect(buildShareText(data({ verdict: 'unknown', ai_probability: null }), 'https://youtu.be/x')).toBeNull();
  });
});

describe('결과 화면: 다시 보내기 버튼', () => {
  it('공유로 들어옴 → [카카오톡 등으로 다시 보내기], 누르면 OS 공유 시트로 결과+원래 링크', async () => {
    const spy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    render(
      <ResultScreen data={data({})} url="https://kko.to/AbCd12" fromShare onRetry={noop} onAgain={noop} onSubmitVideo={noop} />,
    );
    expect(screen.queryByText(copy.result.shareButton)).toBeNull();
    expect(screen.getByText(copy.result.reshareHint)).toBeTruthy();
    fireEvent.press(screen.getByText(copy.result.reshareButton));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const msg = (spy.mock.calls[0][0] as { message: string }).message;
    expect(msg).toContain(copy.result.verdict.likely_ai.headline);
    expect(msg).toContain('https://kko.to/AbCd12');
    expect(msg).toContain('jjajja로 확인했어요');
    spy.mockRestore();
  });
  it('붙여넣기로 들어옴 → 기존 [가족에게 결과 보내기] (같은 동작)', () => {
    render(<ResultScreen data={data({})} url="https://youtu.be/x" onRetry={noop} onAgain={noop} onSubmitVideo={noop} />);
    expect(screen.getByText(copy.result.shareButton)).toBeTruthy();
    expect(screen.queryByText(copy.result.reshareButton)).toBeNull();
  });
  it('공유로 들어왔어도 unknown → 다시 보내기 없음, 다시 확인하기', () => {
    render(
      <ResultScreen
        data={data({ verdict: 'unknown', ai_probability: null, platform: 'upload' })}
        url="https://youtu.be/x"
        fromShare
        onRetry={noop}
        onAgain={noop}
        onSubmitVideo={noop}
      />,
    );
    expect(screen.queryByText(copy.result.reshareButton)).toBeNull();
    expect(screen.getByText(copy.result.retryButton)).toBeTruthy();
  });
});

describe('App: 공유로 열림 → 바로 확인 → 결과', () => {
  const setFetch = (impl: () => Promise<unknown>) => {
    const f = jest.fn(impl);
    (globalThis as unknown as { fetch: unknown }).fetch = f;
    return f;
  };

  it('유튜브 공유 문구를 그대로 source=share로 보내고, 결과에 다시 보내기 버튼', async () => {
    const f = setFetch(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(SAMPLE) }));
    mockIntent = { text: YT_SHARE, webUrl: 'https://youtube.com/shorts/abc123?si=XyZ' };
    render(<App />);
    await waitFor(() => expect(screen.getByText(copy.result.verdict.likely_ai.headline)).toBeTruthy());
    expect(screen.queryByText(copy.home.pasteButton)).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body).toEqual({ url: YT_SHARE, source: 'share' });
    expect(mockReset).toHaveBeenCalled();
    expect(screen.getByText(copy.result.reshareButton)).toBeTruthy();
  });

  it('서버 에러 → 에러 화면, 다시 보내기 없음', async () => {
    setFetch(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: { code: 'video_unavailable', message_ko: 'x' } }),
      }),
    );
    mockIntent = { text: KAKAO_SHARE, webUrl: KAKAO_SHARE };
    render(<App />);
    await waitFor(() => expect(screen.getByText(copy.error.video_unavailable.title)).toBeTruthy());
    expect(screen.queryByText(copy.result.reshareButton)).toBeNull();
    expect(screen.queryByText(copy.result.shareButton)).toBeNull();
  });

  it('공유 없이 열림 → 평소 홈 (요청 없음)', () => {
    const f = setFetch(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(SAMPLE) }));
    render(<App />);
    expect(screen.getByText(copy.home.pasteButton)).toBeTruthy();
    expect(f).not.toHaveBeenCalled();
  });
});
