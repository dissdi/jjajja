import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
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
jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn() }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: () => {} }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

const data = (o: Partial<DetectResponse>): DetectResponse => ({ ...(SAMPLE as DetectResponse), ...o });
const noop = () => {};

describe('S3 결과', () => {
  it.each<Verdict>(['likely_ai', 'uncertain', 'likely_real'])('%s: 헤드라인·퍼센트·근거·공유 버튼', (v) => {
    render(<ResultScreen data={data({ verdict: v })} url="https://youtu.be/x" onRetry={noop} onAgain={noop} />);
    expect(screen.getByText(copy.result.verdict[v].headline)).toBeTruthy();
    expect(screen.getByText('AI 가능성 87%')).toBeTruthy();
    expect(screen.getByText(copy.result.evidenceTitle)).toBeTruthy();
    expect(screen.getByText(copy.result.shareButton)).toBeTruthy();
    expect(screen.queryByText(copy.result.retryButton)).toBeNull();
  });

  it('unknown: 퍼센트·근거·공유 숨김, 다시 확인하기', () => {
    render(
      <ResultScreen data={data({ verdict: 'unknown', ai_probability: null })} url="https://youtu.be/x" onRetry={noop} onAgain={noop} />,
    );
    expect(screen.getByText(copy.result.verdict.unknown.headline)).toBeTruthy();
    expect(screen.queryByText(/AI 가능성/)).toBeNull();
    expect(screen.queryByText(copy.result.evidenceTitle)).toBeNull();
    expect(screen.queryByText(copy.result.shareButton)).toBeNull();
    expect(screen.getByText(copy.result.retryButton)).toBeTruthy();
  });

  it('partial + 영상 확인 실패 → partialNoVideo 한 줄', () => {
    render(<ResultScreen data={data({ partial: true })} url="https://youtu.be/x" onRetry={noop} onAgain={noop} />);
    expect(screen.getByText(copy.result.partialNoVideo)).toBeTruthy();
  });

  it('근거 0개 → evidenceEmpty', () => {
    render(<ResultScreen data={data({ verdict: 'likely_real', signals: [] })} url={null} onRetry={noop} onAgain={noop} />);
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
