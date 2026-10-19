import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import App from '../App';
import { YoutubeScreen } from '../src/screens/YoutubeScreen';
import { YoutubeScreen as YoutubeScreenWeb } from '../src/screens/YoutubeScreen.web';
import { copy } from '../src/ux/copy';
import { BRIDGE_MESSAGE_TYPE } from '../src/youtube/bridge';
import { SAMPLE } from './fixtures';
import { seedLoggedIn } from './authHelpers';
import { __setTokenForTest } from '../src/auth/session';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn() }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: () => {} }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

// WebView 가짜: 받은 props를 보관해 테스트에서 onMessage 등을 직접 부른다. ref 메서드는 mockWebHandle로 확인
const mockWebProps: { current: Record<string, any> | null } = { current: null };
const mockWebHandle = { goBack: jest.fn(), reload: jest.fn(), injectJavaScript: jest.fn() };
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  const WebView = React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
    mockWebProps.current = props;
    React.useImperativeHandle(ref, () => mockWebHandle);
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
  Object.values(mockWebHandle).forEach((f) => f.mockClear());
});

/** Android 하드웨어 뒤로: 지금 등록된(마지막) 핸들러를 부른다 */
function pressHardwareBack(spy: jest.SpyInstance) {
  const calls = spy.mock.calls.filter((c) => c[0] === 'hardwareBackPress');
  let handled = false;
  act(() => {
    handled = (calls[calls.length - 1][1] as () => boolean)();
  });
  return handled;
}
afterEach(() => jest.useRealTimers());

describe('앱 안 유튜브 화면', () => {
  it('쇼츠로 이동 → 0.8초 뒤 자동 확인(source=paste) → 배지 → 탭하면 결과 바텀시트', async () => {
    const fetchMock = jest.fn(() => jsonRes({ ...SAMPLE, ai_probability: 0.93, video_id: 'Vid000000a1' }));
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
    render(<YoutubeScreen onExit={noop} onSubmitVideo={noop} />);

    const web = mockWebProps.current!;
    expect(web.source).toEqual({ uri: 'https://m.youtube.com/shorts' });
    expect(typeof web.injectedJavaScript).toBe('string');
    // 영상 아님 → 대기 배지(뒤로·나가기 메뉴 손잡이)는 보인다
    expect(screen.getByText(copy.youtube.badgeIdle)).toBeTruthy();

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

  it('자동 확인도 로그인 토큰을 쓴다 (Authorization: Bearer)', async () => {
    __setTokenForTest('yt-token');
    const fetchMock = jest.fn(() => jsonRes(SAMPLE));
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
    render(<YoutubeScreen onExit={noop} onSubmitVideo={noop} />);
    act(() => mockWebProps.current!.onMessage(msg('https://m.youtube.com/shorts/Vid000000e5')));
    await act(async () => {
      jest.advanceTimersByTime(800);
    });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer yt-token');
    __setTokenForTest(null);
  });

  it('배지는 불투명 크림 면 + 2px 잉크 테두리, 판정 아이콘은 outline', async () => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(() => jsonRes(SAMPLE));
    render(<YoutubeScreen onExit={noop} onSubmitVideo={noop} />);
    act(() => mockWebProps.current!.onMessage(msg('https://m.youtube.com/shorts/Vid000000f6')));
    await act(async () => {
      jest.advanceTimersByTime(800);
    });
    await screen.findByTestId('badge-icon-likely_ai');
    const { StyleSheet } = require('react-native');
    const { color, border } = require('../src/ux/theme');
    const badge = screen.getByTestId('youtube-badge');
    const style = StyleSheet.flatten(typeof badge.props.style === 'function' ? badge.props.style({ pressed: false }) : badge.props.style);
    expect(style.backgroundColor).toBe(color.surface);
    expect(style.borderColor).toBe(color.ink);
    expect(style.borderWidth).toBe(border.strong);
    expect(style.shadowOpacity).toBeUndefined();
    fireEvent.press(badge);
    // v2 §5.5: 높이 40 + hitSlop 4 → 터치 48
    const { size, radius } = require('../src/ux/theme');
    expect(style.minHeight).toBe(size.badgeHeight);
    expect(style.minHeight + 2 * badge.props.hitSlop).toBeGreaterThanOrEqual(size.touchMin);
    const sheet = StyleSheet.flatten(screen.getByTestId('youtube-sheet').props.style);
    expect(sheet.backgroundColor).toBe(color.paper);
    // v2 §5.6: 윗선 없음(scrim만), 윗모서리 16
    expect(sheet.borderTopWidth).toBeUndefined();
    expect(sheet.borderTopLeftRadius).toBe(radius.sheet);
  });

  it('앱 열기 주소는 WebView 안에서 막는다', () => {
    render(<YoutubeScreen onExit={noop} onSubmitVideo={noop} />);
    const allow = mockWebProps.current!.onShouldStartLoadWithRequest;
    expect(allow({ url: 'intent://x#Intent;end' })).toBe(false);
    expect(allow({ url: 'https://m.youtube.com/shorts/abc' })).toBe(true);
  });

  it('상단 막대 없음: 처음 화면에 뒤로·쇼츠 처음으로·나가기 버튼이 보이지 않는다', () => {
    render(<YoutubeScreen onExit={noop} onSubmitVideo={noop} />);
    expect(screen.queryByText(copy.youtube.backButton)).toBeNull();
    expect(screen.queryByText(copy.youtube.shortsButton)).toBeNull();
    expect(screen.queryByText(copy.youtube.exitButton)).toBeNull();
    expect(screen.queryByTestId('youtube-sheet')).toBeNull();
    expect(screen.getByTestId('youtube-badge')).toBeTruthy();
  });

  it('결과 없음(영상 아닌 화면)에서도 배지 탭 → 시트: 상태 한 줄 + 세 가지 이동 버튼', () => {
    render(<YoutubeScreen onExit={noop} onSubmitVideo={noop} />);
    fireEvent.press(screen.getByTestId('youtube-badge'));
    expect(screen.getByText(copy.youtube.sheetIdle)).toBeTruthy();
    expect(screen.getByTestId('youtube-nav-back')).toBeTruthy();
    expect(screen.getByTestId('youtube-nav-shorts')).toBeTruthy();
    expect(screen.getByTestId('youtube-nav-exit')).toBeTruthy();
    expect(screen.getByText(copy.youtube.backButton)).toBeTruthy();
    expect(screen.getByText(copy.youtube.shortsButton)).toBeTruthy();
    expect(screen.getByText(copy.youtube.exitButton)).toBeTruthy();
  });

  it('확인 중에도 배지 탭 → 시트에 확인 중 + 이동 버튼', () => {
    render(<YoutubeScreen onExit={noop} onSubmitVideo={noop} />);
    act(() => mockWebProps.current!.onMessage(msg('https://m.youtube.com/shorts/Vid000000g7')));
    fireEvent.press(screen.getByTestId('youtube-badge'));
    expect(screen.getByText(copy.loading.title)).toBeTruthy();
    expect(screen.getByTestId('youtube-nav-exit')).toBeTruthy();
  });

  it('결과 시트에도 이동 버튼이 있고, 주 버튼은 하나(보내기)뿐', async () => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(() => jsonRes(SAMPLE));
    render(<YoutubeScreen onExit={noop} onSubmitVideo={noop} />);
    act(() => mockWebProps.current!.onMessage(msg('https://m.youtube.com/shorts/Vid000000h8')));
    await act(async () => {
      jest.advanceTimersByTime(800);
    });
    await screen.findByTestId('badge-icon-likely_ai');
    fireEvent.press(screen.getByTestId('youtube-badge'));
    expect(screen.getByText(copy.result.shareButton)).toBeTruthy();
    const { StyleSheet } = require('react-native');
    const { color, size } = require('../src/ux/theme');
    for (const id of ['youtube-nav-back', 'youtube-nav-shorts', 'youtube-nav-exit']) {
      const b = screen.getByTestId(id);
      const s = StyleSheet.flatten(b.props.style);
      expect(s.backgroundColor).not.toBe(color.ink); // 선 버튼 (주 버튼 아님)
      expect(s.borderColor).toBe(color.lineUi);
      expect(s.minHeight + 2 * b.props.hitSlop).toBe(52);
      expect(s.minHeight).toBeLessThanOrEqual(size.buttonMinHeight);
    }
  });

  it('[뒤로]: 유튜브 안에 뒤로 갈 곳이 있으면 WebView 뒤로 + 시트 닫힘', () => {
    const onExit = jest.fn();
    render(<YoutubeScreen onExit={onExit} onSubmitVideo={noop} />);
    act(() => mockWebProps.current!.onNavigationStateChange({ url: 'https://m.youtube.com/', canGoBack: true }));
    fireEvent.press(screen.getByTestId('youtube-badge'));
    fireEvent.press(screen.getByLabelText(copy.youtube.backA11yLabel));
    expect(mockWebHandle.goBack).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();
    expect(screen.queryByTestId('youtube-sheet')).toBeNull();
  });

  it('[뒤로]: 더 갈 곳이 없으면 앱 홈(onExit)', () => {
    const onExit = jest.fn();
    render(<YoutubeScreen onExit={onExit} onSubmitVideo={noop} />);
    fireEvent.press(screen.getByTestId('youtube-badge'));
    fireEvent.press(screen.getByTestId('youtube-nav-back'));
    expect(mockWebHandle.goBack).not.toHaveBeenCalled();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('[쇼츠 처음으로]: 쇼츠 첫 화면으로 이동 + 시트 닫힘', () => {
    render(<YoutubeScreen onExit={noop} onSubmitVideo={noop} />);
    fireEvent.press(screen.getByTestId('youtube-badge'));
    fireEvent.press(screen.getByTestId('youtube-nav-shorts'));
    expect(mockWebHandle.injectJavaScript).toHaveBeenCalledWith(expect.stringContaining('https://m.youtube.com/shorts'));
    expect(screen.queryByTestId('youtube-sheet')).toBeNull();
  });

  it('[나가기] → onExit', () => {
    const onExit = jest.fn();
    render(<YoutubeScreen onExit={onExit} onSubmitVideo={noop} />);
    fireEvent.press(screen.getByTestId('youtube-badge'));
    fireEvent.press(screen.getByLabelText(copy.youtube.exitA11yLabel));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('하드웨어 뒤로: 시트 열림 → 닫기, 다음은 유튜브 뒤로, 더 없으면 앱 홈', () => {
    const spy = jest.spyOn(BackHandler, 'addEventListener');
    const onExit = jest.fn();
    render(<YoutubeScreen onExit={onExit} onSubmitVideo={noop} />);
    act(() => mockWebProps.current!.onNavigationStateChange({ url: 'https://m.youtube.com/', canGoBack: true }));
    fireEvent.press(screen.getByTestId('youtube-badge'));
    expect(screen.getByTestId('youtube-sheet')).toBeTruthy();

    expect(pressHardwareBack(spy)).toBe(true); // 1) 시트 닫기
    expect(screen.queryByTestId('youtube-sheet')).toBeNull();
    expect(mockWebHandle.goBack).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();

    expect(pressHardwareBack(spy)).toBe(true); // 2) 유튜브 안에서 뒤로
    expect(mockWebHandle.goBack).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();

    act(() => mockWebProps.current!.onNavigationStateChange({ url: 'https://m.youtube.com/shorts', canGoBack: false }));
    expect(pressHardwareBack(spy)).toBe(true); // 3) 더 없으면 앱 홈
    expect(onExit).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('웹 버전은 WebView 없이 안내만 보여준다', () => {
    const onExit = jest.fn();
    render(<YoutubeScreenWeb onExit={onExit} onSubmitVideo={noop} />);
    expect(screen.getByText(copy.youtube.webOnly.title)).toBeTruthy();
    expect(mockWebProps.current).toBeNull();
    fireEvent.press(screen.getByText(copy.youtube.webOnly.button));
    expect(onExit).toHaveBeenCalled();
  });

  it('홈의 진입 버튼 → 유튜브 화면 → 나가기 → 홈', async () => {
    seedLoggedIn();
    render(<App />);
    fireEvent.press(await screen.findByText(copy.home.youtubeButton));
    expect(screen.getByTestId('youtube-webview')).toBeTruthy();
    fireEvent.press(screen.getByTestId('youtube-badge'));
    fireEvent.press(screen.getByLabelText(copy.youtube.exitA11yLabel));
    expect(screen.getByText(copy.home.youtubeButton)).toBeTruthy();
  });
});
