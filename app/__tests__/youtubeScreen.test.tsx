import { act, fireEvent, render, screen } from '@testing-library/react-native';
import App from '../App';
import { YoutubeScreen } from '../src/screens/YoutubeScreen';
import { YoutubeScreen as YoutubeScreenWeb } from '../src/screens/YoutubeScreen.web';
import { copy } from '../src/ux/copy';
import { BRIDGE_MESSAGE_TYPE } from '../src/youtube/bridge';
import { SAMPLE } from './fixtures';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn() }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: () => {} }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

// WebView 가짜: 받은 props를 보관해 테스트에서 onMessage 등을 직접 부른다
const mockWebProps: { current: Record<string, any> | null } = { current: null };
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  const WebView = React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
    mockWebProps.current = props;
    React.useImperativeHandle(ref, () => ({ goBack: jest.fn(), reload: jest.fn(), injectJavaScript: jest.fn() }));
    return React.createElement(View, { testID: props.testID });
  });
  return { WebView, default: WebView };
});

const msg = (url: string) => ({ nativeEvent: { data: JSON.stringify({ type: BRIDGE_MESSAGE_TYPE, url, reason: 'poll' }) } });
const jsonRes = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const noop = () => {};

beforeEach(() => {
  jest.useFakeTimers();
  mockWebProps.current = null;
});
afterEach(() => jest.useRealTimers());

describe('앱 안 유튜브 화면', () => {
  it('쇼츠로 이동 → 0.8초 뒤 자동 확인(source=paste) → 배지 → 탭하면 결과 바텀시트', async () => {
    const fetchMock = jest.fn(() => jsonRes({ ...SAMPLE, ai_probability: 0.93, video_id: 'Vid000000a1' }));
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
    render(<YoutubeScreen onExit={noop} onSubmitVideo={noop} />);

    const web = mockWebProps.current!;
    expect(web.source).toEqual({ uri: 'https://m.youtube.com/shorts' });
    expect(typeof web.injectedJavaScript).toBe('string');
    expect(screen.queryByTestId('youtube-badge')).toBeNull(); // 영상 아님 → 배지 없음

    act(() => web.onMessage(msg('https://m.youtube.com/shorts/Vid000000a1?si=x')));
    expect(screen.getByText(copy.youtube.badgeChecking)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(800);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/v1\/detect$/);
    expect(JSON.parse(String(init.body))).toEqual({ url: 'https://www.youtube.com/shorts/Vid000000a1', source: 'paste' });
    expect(await screen.findByText('AI 가능성 93%')).toBeTruthy();

    fireEvent.press(screen.getByTestId('youtube-badge'));
    expect(screen.getByText(copy.result.verdict.likely_ai.headline)).toBeTruthy();
    expect(screen.getByText(copy.result.evidenceTitle)).toBeTruthy();
    fireEvent.press(screen.getByText(copy.youtube.sheetClose));
    expect(screen.queryByText(copy.result.verdict.likely_ai.headline)).toBeNull();
  });

  it('onNavigationStateChange 주소로도 감지, 돌아온 영상은 캐시로 재요청 없음', async () => {
    const fetchMock = jest.fn(() => jsonRes({ ...SAMPLE, ai_probability: 0.2, verdict: 'likely_real' }));
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
    render(<YoutubeScreen onExit={noop} onSubmitVideo={noop} />);
    const web = mockWebProps.current!;
    act(() => web.onNavigationStateChange({ url: 'https://m.youtube.com/watch?v=Vid000000b2', canGoBack: true }));
    await act(async () => {
      jest.advanceTimersByTime(800);
    });
    expect(await screen.findByText('AI 가능성 20%')).toBeTruthy();
    act(() => web.onMessage(msg('https://m.youtube.com/shorts/Vid000000c3')));
    act(() => web.onMessage(msg('https://m.youtube.com/watch?v=Vid000000b2')));
    expect(screen.getByText('AI 가능성 20%')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1); // c3는 0.8초 안 돼서 건너뜀, b2는 캐시
  });

  it('오류 → 배지 탭 → 오류 문구 + 다시 해보기', async () => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(() => Promise.reject(new Error('offline')));
    render(<YoutubeScreen onExit={noop} onSubmitVideo={noop} />);
    act(() => mockWebProps.current!.onMessage(msg('https://m.youtube.com/shorts/Vid000000d4')));
    await act(async () => {
      jest.advanceTimersByTime(800);
    });
    expect(await screen.findByText(copy.youtube.badgeError)).toBeTruthy();
    fireEvent.press(screen.getByTestId('youtube-badge'));
    expect(screen.getByText(copy.error.network.title)).toBeTruthy();
    expect(screen.getByText(copy.youtube.retryButton)).toBeTruthy();
  });

  it('앱 열기 주소는 WebView 안에서 막는다', () => {
    render(<YoutubeScreen onExit={noop} onSubmitVideo={noop} />);
    const allow = mockWebProps.current!.onShouldStartLoadWithRequest;
    expect(allow({ url: 'intent://x#Intent;end' })).toBe(false);
    expect(allow({ url: 'https://m.youtube.com/shorts/abc' })).toBe(true);
  });

  it('나가기 → onExit', () => {
    const onExit = jest.fn();
    render(<YoutubeScreen onExit={onExit} onSubmitVideo={noop} />);
    fireEvent.press(screen.getByLabelText(copy.youtube.exitA11yLabel));
    expect(onExit).toHaveBeenCalled();
  });

  it('웹 버전은 WebView 없이 안내만 보여준다', () => {
    const onExit = jest.fn();
    render(<YoutubeScreenWeb onExit={onExit} onSubmitVideo={noop} />);
    expect(screen.getByText(copy.youtube.webOnly.title)).toBeTruthy();
    expect(mockWebProps.current).toBeNull();
    fireEvent.press(screen.getByText(copy.youtube.webOnly.button));
    expect(onExit).toHaveBeenCalled();
  });

  it('홈의 진입 버튼 → 유튜브 화면 → 나가기 → 홈', () => {
    render(<App />);
    fireEvent.press(screen.getByText(copy.home.youtubeButton));
    expect(screen.getByTestId('youtube-webview')).toBeTruthy();
    fireEvent.press(screen.getByLabelText(copy.youtube.exitA11yLabel));
    expect(screen.getByText(copy.home.youtubeButton)).toBeTruthy();
  });
});
