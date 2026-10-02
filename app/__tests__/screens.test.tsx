import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { AppState } from 'react-native';
import App from '../App';
import type { DetectResponse, Verdict } from '../src/api/contract';
import { ErrorScreen } from '../src/screens/ErrorScreen';
import { ResultScreen } from '../src/screens/ResultScreen';
import { copy } from '../src/ux/copy';
import { SAMPLE } from './fixtures';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-clipboard', () => ({
  getStringAsync: jest.fn(),
  hasUrlAsync: jest.fn(() => Promise.resolve(false)),
  hasStringAsync: jest.fn(() => Promise.resolve(false)),
}));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: () => {} }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

const data = (o: Partial<DetectResponse>): DetectResponse => ({ ...(SAMPLE as DetectResponse), ...o });
const noop = () => {};

describe('S3 결과', () => {
  it.each<Verdict>(['likely_ai', 'uncertain', 'likely_real'])('%s: 헤드라인·퍼센트·근거·공유 버튼', (v) => {
    render(<ResultScreen data={data({ verdict: v })} url="https://youtu.be/x" onRetry={noop} onAgain={noop} onSubmitVideo={noop} />);
    expect(screen.getByText(copy.result.verdict[v].headline)).toBeTruthy();
    expect(screen.getByText('AI 가능성 87%')).toBeTruthy();
    expect(screen.getByText(copy.result.evidenceTitle)).toBeTruthy();
    expect(screen.getByText(copy.result.shareButton)).toBeTruthy();
    expect(screen.queryByText(copy.result.retryButton)).toBeNull();
  });

  it('unknown: 퍼센트·근거·공유 숨김, 다시 확인하기', () => {
    render(
      <ResultScreen data={data({ verdict: 'unknown', ai_probability: null })} url="https://youtu.be/x" onRetry={noop} onAgain={noop} onSubmitVideo={noop} />,
    );
    expect(screen.getByText(copy.result.verdict.unknown.headline)).toBeTruthy();
    expect(screen.queryByText(/AI 가능성/)).toBeNull();
    expect(screen.queryByText(copy.result.evidenceTitle)).toBeNull();
    expect(screen.queryByText(copy.result.shareButton)).toBeNull();
    expect(screen.getByText(copy.result.retryButton)).toBeTruthy();
  });

  it('partial + 영상 확인 실패 → partialNoVideo 한 줄', () => {
    render(<ResultScreen data={data({ partial: true })} url="https://youtu.be/x" onRetry={noop} onAgain={noop} onSubmitVideo={noop} />);
    expect(screen.getByText(copy.result.partialNoVideo)).toBeTruthy();
  });

  it('D1: 주소로 확인 + unknown + partial → 저장한 영상으로 확인 안내, 다시 시도 문구 없음', async () => {
    const picker = require('expo-image-picker').launchImageLibraryAsync as jest.Mock;
    picker.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///v.mp4', fileName: 'v.mp4', mimeType: 'video/mp4' }] });
    const onSubmitVideo = jest.fn();
    const onRetry = jest.fn();
    render(
      <ResultScreen
        data={data({ verdict: 'unknown', ai_probability: null, partial: true, platform: 'youtube' })}
        url="https://youtu.be/x"
        onRetry={onRetry}
        onAgain={noop}
        onSubmitVideo={onSubmitVideo}
      />,
    );
    expect(screen.getByText(copy.result.linkOnly.headline)).toBeTruthy();
    expect(screen.getByText(copy.result.linkOnly.sub)).toBeTruthy();
    expect(screen.getByText(copy.result.linkOnly.saveHint)).toBeTruthy();
    expect(screen.queryByText(copy.result.verdict.unknown.sub)).toBeNull();
    expect(screen.queryByText(copy.result.retryButton)).toBeNull();
    expect(screen.queryByText(copy.result.partialNoVideo)).toBeNull();
    expect(screen.queryByText(/AI 가능성/)).toBeNull();
    expect(screen.queryByText(copy.result.evidenceTitle)).toBeNull();
    expect(screen.queryByText(copy.result.shareButton)).toBeNull();
    expect(screen.getByText(copy.result.againButton)).toBeTruthy();
    fireEvent.press(screen.getByText(copy.result.linkOnly.uploadButton));
    await waitFor(() => expect(onSubmitVideo).toHaveBeenCalledWith(expect.objectContaining({ uri: 'file:///v.mp4' })));
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('D1: 업로드 unknown → 기존 문구', () => {
    render(
      <ResultScreen
        data={data({ verdict: 'unknown', ai_probability: null, partial: true, platform: 'upload' })}
        url={null}
        onRetry={noop}
        onAgain={noop}
        onSubmitVideo={noop}
      />,
    );
    expect(screen.getByText(copy.result.verdict.unknown.headline)).toBeTruthy();
    expect(screen.getByText(copy.result.retryButton)).toBeTruthy();
    expect(screen.queryByText(copy.result.linkOnly.headline)).toBeNull();
  });

  it('자세히 보기: 기본 접힘 → 누르면 모델 점수·경고 표시', () => {
    const signals = [
      { id: 'commfor_224', kind: 'model', status: 'ok', decisive: false, score: 0.05, weight: 0.25,
        evidence_ko: '화면 속 장면에서 AI 흔적은 찾지 못했어요', via: 'model' },
    ] as DetectResponse['signals'];
    render(<ResultScreen data={data({ verdict: 'uncertain', signals })} url="https://youtu.be/x" onRetry={noop} onAgain={noop} onSubmitVideo={noop} />);
    expect(screen.queryByText('AI 가능성 5%')).toBeNull();
    fireEvent.press(screen.getByText(copy.result.details.toggle));
    expect(screen.getByText('화면 속 장면 확인')).toBeTruthy();
    expect(screen.getByText('AI 가능성 5%')).toBeTruthy();
    expect(screen.getByText(copy.result.details.modelCaution)).toBeTruthy();
    fireEvent.press(screen.getByText(copy.result.details.toggle));
    expect(screen.queryByText('AI 가능성 5%')).toBeNull();
  });

  it('근거 0개 → evidenceEmpty', () => {
    render(<ResultScreen data={data({ verdict: 'likely_real', signals: [] })} url={null} onRetry={noop} onAgain={noop} onSubmitVideo={noop} />);
    expect(screen.getByText(copy.result.evidenceEmpty)).toBeTruthy();
  });
});

describe('S4 에러', () => {
  it('invalid_url: 다시 붙여넣기만 (처음으로 숨김), 서버 message_ko 미사용', () => {
    const onHome = jest.fn();
    render(<ErrorScreen code="invalid_url" onRetry={noop} onHome={onHome} />);
    fireEvent.press(screen.getByText(copy.error.invalid_url.button));
    expect(onHome).toHaveBeenCalled();
    expect(screen.queryByText(copy.error.homeButton)).toBeNull();
  });
  it('network: 다시 해보기 + 처음으로', () => {
    const onRetry = jest.fn();
    render(<ErrorScreen code="network" onRetry={onRetry} onHome={noop} />);
    fireEvent.press(screen.getByText(copy.error.network.button));
    expect(onRetry).toHaveBeenCalled();
    expect(screen.getByText(copy.error.homeButton)).toBeTruthy();
  });
});

describe('App 흐름', () => {
  it('붙여넣기 → 즉시 확인 → 결과', async () => {
    (Clipboard.getStringAsync as jest.Mock).mockResolvedValue('https://youtube.com/shorts/abc123');
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(SAMPLE) }),
    );
    render(<App />);
    expect(screen.getByText(copy.home.firstRunHint)).toBeTruthy();
    expect(screen.getByText(copy.home.uploadButton)).toBeTruthy();
    fireEvent.press(screen.getByText(copy.home.pasteButton));
    await waitFor(() => expect(screen.getByText(copy.result.verdict.likely_ai.headline)).toBeTruthy());
    fireEvent.press(screen.getByText(copy.result.againButton));
    expect(screen.getByText(copy.home.pasteButton)).toBeTruthy();
    expect(screen.queryByText(copy.home.firstRunHint)).toBeNull();
  });

  it('빈 클립보드 → 인라인 오류', async () => {
    (Clipboard.getStringAsync as jest.Mock).mockResolvedValue('');
    render(<App />);
    fireEvent.press(screen.getByText(copy.home.pasteButton));
    await waitFor(() => expect(screen.getByText(copy.home.inlineError.clipboardEmpty)).toBeTruthy());
  });

  it('서버 에러 → S4 문구', async () => {
    (Clipboard.getStringAsync as jest.Mock).mockResolvedValue('https://example.com/x');
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ error: { code: 'unsupported_platform', message_ko: '서버 문구' } }),
      }),
    );
    render(<App />);
    fireEvent.press(screen.getByText(copy.home.pasteButton));
    await waitFor(() => expect(screen.getByText(copy.error.unsupported_platform.title)).toBeTruthy());
    expect(screen.queryByText('서버 문구')).toBeNull();
  });
});

describe('복사만 해도 확인 (#12)', () => {
  const sentSource = (fetchMock: jest.Mock) => JSON.parse(fetchMock.mock.calls[0][1].body).source;
  const okFetch = () =>
    jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(SAMPLE) }));

  beforeEach(() => jest.clearAllMocks()); // 앞 테스트의 호출 기록 제거 (구현은 유지)
  afterEach(() => {
    (Clipboard.hasUrlAsync as jest.Mock).mockResolvedValue(false);
    jest.restoreAllMocks();
  });

  it('클립보드에 주소가 없으면 안내 없음, 붙여넣기는 source=paste', async () => {
    (Clipboard.getStringAsync as jest.Mock).mockResolvedValue('https://youtube.com/shorts/abc123');
    const f = okFetch();
    (globalThis as unknown as { fetch: unknown }).fetch = f;
    render(<App />);
    await waitFor(() => expect(Clipboard.hasUrlAsync).toHaveBeenCalled());
    expect(screen.queryByText(copy.home.clipboardHint)).toBeNull();
    fireEvent.press(screen.getByText(copy.home.pasteButton));
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(sentSource(f)).toBe('paste');
  });

  it('주소가 있으면 안내 → 붙여넣기는 source=clipboard, 홈으로 돌아와도 같은 안내 반복 없음', async () => {
    (Clipboard.hasUrlAsync as jest.Mock).mockResolvedValue(true);
    (Clipboard.getStringAsync as jest.Mock).mockResolvedValue('https://youtube.com/shorts/abc123');
    const f = okFetch();
    (globalThis as unknown as { fetch: unknown }).fetch = f;
    render(<App />);
    await waitFor(() => expect(screen.getByText(copy.home.clipboardHint)).toBeTruthy());
    expect(Clipboard.getStringAsync).not.toHaveBeenCalled(); // 누르기 전에는 내용을 읽지 않는다
    fireEvent.press(screen.getByText(copy.home.pasteButton));
    await waitFor(() => expect(screen.getByText(copy.result.verdict.likely_ai.headline)).toBeTruthy());
    expect(sentSource(f)).toBe('clipboard');
    fireEvent.press(screen.getByText(copy.result.againButton));
    expect(screen.getByText(copy.home.pasteButton)).toBeTruthy();
    expect(screen.queryByText(copy.home.clipboardHint)).toBeNull();
  });

  it('앱이 다시 앞으로 오면 다시 확인해 안내', async () => {
    let onChange: ((s: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_t, h) => {
      onChange = h as (s: string) => void;
      return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
    });
    render(<App />);
    await waitFor(() => expect(Clipboard.hasUrlAsync).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(copy.home.clipboardHint)).toBeNull();
    (Clipboard.hasUrlAsync as jest.Mock).mockResolvedValue(true);
    act(() => onChange?.('background'));
    act(() => onChange?.('active'));
    await waitFor(() => expect(screen.getByText(copy.home.clipboardHint)).toBeTruthy());
    expect(Clipboard.hasUrlAsync).toHaveBeenCalledTimes(2);
  });

  it('입력칸에 글을 넣으면 안내를 숨김', async () => {
    (Clipboard.hasUrlAsync as jest.Mock).mockResolvedValue(true);
    render(<App />);
    await waitFor(() => expect(screen.getByText(copy.home.clipboardHint)).toBeTruthy());
    fireEvent.changeText(screen.getByLabelText(copy.home.inputA11yLabel), 'https://youtu.be/x');
    expect(screen.queryByText(copy.home.clipboardHint)).toBeNull();
  });
});
