// 로그인 필수 (계약 v2.0, GitHub #20): 계약 파서, 토큰 헤더, 401 흐름, 로그인·가입·기록·계정 화면
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import App from '../App';
import {
  deleteHistory,
  detect,
  getHistory,
  login,
  logout,
  mapAuthError,
  signup,
} from '../src/api/client';
import {
  AUTH_ERROR_CODES,
  type DetectResponse,
  parseAuthResponse,
  parseHistoryResponse,
  parseMeResponse,
} from '../src/api/contract';
import { deviceNameFor } from '../src/auth/deviceName';
import { __setTokenForTest, getToken } from '../src/auth/session';
import { DevBand, devBandText } from '../src/components/ui';
import { authErrorText, validateSignup } from '../src/screens/AuthScreens';
import { copy } from '../src/ux/copy';
import { debugBarsFor } from '../src/ux/debugView';
import { historySummaryFor } from '../src/ux/present';
import { formatWhen } from '../src/ux/when';
import { seedLoggedIn, seedLoggedOut, storedToken, TEST_TOKEN } from './authHelpers';
import { SAMPLE } from './fixtures';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn() }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: () => {} }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

let mockIntent: { text: string | null; webUrl: string | null } | null = null;
jest.mock('expo-share-intent', () => ({
  useShareIntent: () => ({
    isReady: true,
    hasShareIntent: mockIntent !== null,
    shareIntent: mockIntent ?? { text: null, webUrl: null, files: null, type: null },
    resetShareIntent: () => {},
    error: null,
  }),
}));

const USER = { id: 'u1', email: 'hong@naver.com', created_at: '2026-10-19T00:00:00Z' };
const item = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  checked_at: '2026-10-19T05:05:00Z',
  source: 'paste',
  platform: 'youtube',
  video_id: 'abc',
  url: `https://youtube.com/shorts/${id}`,
  verdict: 'likely_ai',
  ai_probability: 0.87,
  device_name: 'Android 앱 (Pixel 8)',
  ...o,
});

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
type Route = (c: Call) => { status: number; body?: unknown } | undefined;

/** URL·메서드로 응답을 고르는 가짜 fetch. 호출 기록을 돌려준다 */
function mockServer(route: Route): Call[] {
  const calls: Call[] = [];
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    const c: Call = {
      url: String(url),
      method: init.method ?? 'GET',
      headers: (init.headers ?? {}) as Record<string, string>,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
    };
    calls.push(c);
    const r = route(c) ?? { status: 500, body: null };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => {
        if (r.body === undefined) throw new SyntaxError('no body');
        return r.body;
      },
    };
  });
  return calls;
}
const err = (status: number, code: string) => ({ status, body: { error: { code, message_ko: '서버 문구' } } });
const path = (c: Call) => c.url.replace(/^https?:\/\/[^/]+/, '');

beforeEach(() => {
  mockIntent = null;
  __setTokenForTest(null);
});

// ---------------------------------------------------------------------------
describe('계약 v2.0 파서', () => {
  it('auth 응답', () => {
    expect(parseAuthResponse({ token: 't', user: USER })).toEqual({ token: 't', user: USER });
    expect(parseAuthResponse({ token: '', user: USER })).toBeNull();
    expect(parseAuthResponse({ token: 't', user: { id: 'u1' } })).toBeNull();
  });
  it('me 응답', () => {
    const d = { id: 'd1', device_name: 'iPhone 앱', last_used_at: '2026-10-19T00:00:00Z', current: true };
    expect(parseMeResponse({ user: USER, devices: [d] })).toEqual({ user: USER, devices: [d] });
    expect(parseMeResponse({ user: USER, devices: [{ ...d, current: 'yes' }] })).toBeNull();
  });
  it('history: source null 허용(v2.0 보완), url null(업로드), next null', () => {
    const body = { items: [item('a', { source: null }), item('b', { url: null, platform: 'upload', video_id: null })], next: null };
    const p = parseHistoryResponse(body)!;
    expect(p.items).toHaveLength(2);
    expect(p.items[0].source).toBeNull();
    expect(p.items[1].url).toBeNull();
    expect(parseHistoryResponse({ items: [item('a', { source: 'web' })], next: null })).toBeNull();
    expect(parseHistoryResponse({ items: [item('a', { verdict: 'fake' })], next: null })).toBeNull();
    expect(parseHistoryResponse({ items: [], next: null })).toEqual({ items: [], next: null });
  });
  it('인증 에러 code 6개 → 문구 매핑 누락 없음', () => {
    expect([...AUTH_ERROR_CODES].sort()).toEqual(
      ['email_taken', 'invalid_credentials', 'invalid_email', 'not_found', 'unauthorized', 'weak_password'].sort(),
    );
    for (const c of AUTH_ERROR_CODES) expect(authErrorText(c)).toBe(copy.auth.error[c]);
    expect(authErrorText('network')).toBe(copy.auth.error.network);
    expect(authErrorText('something_else' as never)).toBe(copy.auth.error.unknown);
  });
});

// ---------------------------------------------------------------------------
describe('client: 토큰 헤더와 401', () => {
  it('detect: Authorization: Bearer <token>', async () => {
    __setTokenForTest('tok-1');
    const calls = mockServer(() => ({ status: 200, body: SAMPLE }));
    expect((await detect('https://youtu.be/x', 'paste')).ok).toBe(true);
    expect(calls[0].headers.Authorization).toBe('Bearer tok-1');
  });
  it('detect 401 → unauthorized, 토큰 삭제', async () => {
    seedLoggedIn('tok-2');
    __setTokenForTest('tok-2');
    mockServer(() => err(401, 'unauthorized'));
    expect(await detect('https://youtu.be/x', 'paste')).toEqual({ ok: false, code: 'unauthorized' });
    expect(getToken()).toBeNull();
    await waitFor(() => expect(storedToken()).toBeNull());
  });
  it('login: 헤더 없음, device_name 전송. 401 invalid_credentials는 토큰을 지우지 않는다', async () => {
    __setTokenForTest('keep');
    const calls = mockServer(() => err(401, 'invalid_credentials'));
    expect(await login('a@b.com', 'pw123456', 'Android 앱')).toEqual({ ok: false, code: 'invalid_credentials' });
    expect(calls[0].headers.Authorization).toBeUndefined();
    expect(calls[0].body).toEqual({ email: 'a@b.com', password: 'pw123456', device_name: 'Android 앱' });
    expect(getToken()).toBe('keep');
  });
  it('signup: device_name도 보낸다 (v2.0 보완), 201 파싱', async () => {
    const calls = mockServer(() => ({ status: 201, body: { token: 'new', user: USER } }));
    const out = await signup('a@b.com', 'pw123456', 'iPhone 앱');
    expect(out).toEqual({ ok: true, data: { token: 'new', user: USER } });
    expect(path(calls[0])).toBe('/v1/auth/signup');
    expect(calls[0].body).toEqual({ email: 'a@b.com', password: 'pw123456', device_name: 'iPhone 앱' });
  });
  it('history: limit·before 쿼리, 삭제 404 not_found, 로그아웃 204', async () => {
    __setTokenForTest('tok');
    const calls = mockServer((c) => {
      if (c.method === 'GET') return { status: 200, body: { items: [], next: null } };
      if (c.method === 'DELETE') return err(404, 'not_found');
      return { status: 204 };
    });
    await getHistory('cur 1');
    expect(path(calls[0])).toBe('/v1/history?limit=20&before=cur+1');
    expect(calls[0].headers.Authorization).toBe('Bearer tok');
    expect(await deleteHistory('h/1')).toEqual({ ok: false, code: 'not_found' });
    expect(path(calls[1])).toBe('/v1/history/h%2F1');
    expect(await logout()).toEqual({ ok: true, data: undefined });
  });
  it('mapAuthError: 본문 없는 429/401/404, 모르는 code', () => {
    expect(mapAuthError(429, null)).toBe('rate_limited');
    expect(mapAuthError(401, null)).toBe('unauthorized');
    expect(mapAuthError(404, null)).toBe('not_found');
    expect(mapAuthError(400, { error: { code: 'weird', message_ko: '' } })).toBe('unknown');
    expect(mapAuthError(409, { error: { code: 'email_taken', message_ko: '' } })).toBe('email_taken');
  });
});

// ---------------------------------------------------------------------------
describe('작은 규칙들', () => {
  it('device_name: 플랫폼 + 모델', () => {
    expect(deviceNameFor('android', 'Pixel 8')).toBe('Android 앱 (Pixel 8)');
    expect(deviceNameFor('android', null)).toBe('Android 앱');
    expect(deviceNameFor('ios', 'iPhone 15')).toBe('iPhone 앱 (iPhone 15)');
    expect(deviceNameFor('ios', 'iPad Air', true)).toBe('iPad 앱 (iPad Air)');
    expect(deviceNameFor('web', 'x')).toBe('웹 브라우저');
  });
  it('formatWhen: 오전/오후, 다른 해는 연도', () => {
    const d = new Date(2026, 9, 19, 14, 5);
    expect(formatWhen(d.toISOString(), new Date(2026, 0, 1))).toBe('10월 19일 오후 2:05');
    expect(formatWhen(new Date(2025, 0, 2, 0, 7).toISOString(), new Date(2026, 0, 1))).toBe('2025년 1월 2일 오전 12:07');
    expect(formatWhen('nope')).toBe('');
  });
  it('가입 검사: 빈칸·형식·8자·불일치', () => {
    expect(validateSignup('', '', '')?.email).toBe(copy.auth.error.emailEmpty);
    expect(validateSignup('hong', 'pw123456', 'pw123456')?.email).toBe(copy.auth.error.invalid_email);
    expect(validateSignup('a@b.com', 'short', 'short')?.password).toBe(copy.auth.error.weak_password);
    expect(validateSignup('a@b.com', 'pw123456', 'pw123457')?.confirm).toBe(copy.auth.error.passwordMismatch);
    expect(validateSignup(' a@b.com ', 'pw123456', 'pw123456')).toBeNull();
  });
  it('기록 요약: verdict 그대로, unknown은 퍼센트 없음', () => {
    expect(historySummaryFor({ verdict: 'likely_ai', ai_probability: 0.87 })).toEqual({
      headline: copy.result.verdict.likely_ai.headline,
      sub: copy.result.verdict.likely_ai.sub,
      percent: 'AI 가능성 87%',
    });
    expect(historySummaryFor({ verdict: 'unknown', ai_probability: null }).percent).toBeNull();
  });
  it('DEV 띠: host + 계약 버전, 꺼져 있으면 없음', () => {
    expect(devBandText('http://192.168.0.10:8000')).toBe('DEV · api 192.168.0.10:8000 · v2.0');
    const { unmount } = render(<DevBand apiBase="http://x:1" enabled />);
    expect(screen.getByText('DEV · api x:1 · v2.0')).toBeTruthy();
    unmount();
    render(<DevBand apiBase="http://x:1" enabled={false} />);
    expect(screen.queryByTestId('dev-band')).toBeNull();
  });
  it('기여도 막대: weight·score/Σweight, 실패 FAIL, weight 0 SKIP', () => {
    const rows = debugBarsFor({
      ...(SAMPLE as DetectResponse),
      signals: [
        { id: 'a', kind: 'model', status: 'ok', decisive: false, score: 0.6, weight: 1, evidence_ko: '', via: 'model', present: null },
        { id: 'b', kind: 'rule', status: 'ok', decisive: true, score: 1, weight: 1, evidence_ko: '', via: 'api', present: true },
        { id: 'c', kind: 'model', status: 'error', decisive: false, score: null, weight: 0.5, evidence_ko: '', via: 'model', present: null },
        { id: 'd', kind: 'model', status: 'ok', decisive: false, score: 0.2, weight: 0, evidence_ko: '', via: 'model', present: null },
      ],
    });
    expect(rows.map((r) => r.chip)).toEqual(['OK', 'OK', 'FAIL', 'SKIP']);
    expect(rows[0].share).toBeCloseTo(0.3);
    expect(rows[1].shareText).toBe('0.500 ◆');
    expect(rows[2].share).toBeNull();
    expect(rows[3].shareText).toBe('(제외)');
  });
});

// ---------------------------------------------------------------------------
describe('App: 로그인 필수 흐름', () => {
  const fill = (id: string, v: string) => fireEvent.changeText(screen.getByTestId(id), v);

  it('토큰 없음 → 첫 화면은 로그인 → 로그인 성공 → 홈, 토큰 저장', async () => {
    seedLoggedOut();
    const calls = mockServer((c) => (path(c) === '/v1/auth/login' ? { status: 200, body: { token: 'T1', user: USER } } : undefined));
    render(<App />);
    expect(await screen.findByText(copy.auth.login.title)).toBeTruthy();
    expect(screen.queryByText(copy.home.pasteButton)).toBeNull();
    fill('login-email', ' hong@naver.com ');
    fill('login-password', 'pw123456');
    fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByText(copy.home.pasteButton)).toBeTruthy();
    expect(calls[0].body).toEqual({ email: 'hong@naver.com', password: 'pw123456', device_name: expect.any(String) });
    expect(storedToken()).toBe('T1');
  });

  it('로그인 실패 → 쉬운 문구, 빈칸은 서버에 보내지 않음', async () => {
    seedLoggedOut();
    const calls = mockServer(() => err(401, 'invalid_credentials'));
    render(<App />);
    fireEvent.press(await screen.findByTestId('login-submit'));
    expect(screen.getByText(copy.auth.error.emailEmpty)).toBeTruthy();
    expect(screen.getByText(copy.auth.error.passwordEmpty)).toBeTruthy();
    expect(calls).toHaveLength(0);
    fill('login-email', 'hong@naver.com');
    fill('login-password', 'wrongpass');
    fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByText(copy.auth.error.invalid_credentials)).toBeTruthy();
    expect(screen.queryByText('서버 문구')).toBeNull();
  });

  it('회원가입: 8자 안내, 불일치, 이미 가입(email_taken) → 성공 → 홈', async () => {
    seedLoggedOut();
    let taken = true;
    const calls = mockServer((c) =>
      path(c) === '/v1/auth/signup'
        ? taken
          ? err(409, 'email_taken')
          : { status: 201, body: { token: 'S1', user: USER } }
        : undefined,
    );
    render(<App />);
    fireEvent.press(await screen.findByText(copy.auth.login.toSignup));
    expect(screen.getByText(copy.auth.signup.passwordHint)).toBeTruthy();
    fill('signup-email', 'hong@naver.com');
    fill('signup-password', 'pw123456');
    fill('signup-confirm', 'pw000000');
    fireEvent.press(screen.getByTestId('signup-submit'));
    expect(screen.getByText(copy.auth.error.passwordMismatch)).toBeTruthy();
    fill('signup-confirm', 'pw123456');
    fireEvent.press(screen.getByTestId('signup-submit'));
    expect(await screen.findByText(copy.auth.error.email_taken)).toBeTruthy();
    taken = false;
    fireEvent.press(screen.getByTestId('signup-submit'));
    expect(await screen.findByText(copy.home.pasteButton)).toBeTruthy();
    expect((calls[calls.length - 1].body as { device_name: string }).device_name).toEqual(expect.any(String));
    expect(storedToken()).toBe('S1');
  });

  it('공유로 들어왔는데 로그인 전 → 로그인 화면(안내) → 로그인 후 바로 그 공유를 확인', async () => {
    seedLoggedOut();
    mockIntent = { text: '제목 https://youtube.com/shorts/abc123', webUrl: null };
    const calls = mockServer((c) => {
      if (path(c) === '/v1/auth/login') return { status: 200, body: { token: 'T2', user: USER } };
      if (path(c) === '/v1/detect') return { status: 200, body: SAMPLE };
      return undefined;
    });
    render(<App />);
    expect(await screen.findByText(copy.auth.login.pendingNote)).toBeTruthy();
    expect(calls).toHaveLength(0); // 토큰 없이 확인을 보내지 않는다
    fill('login-email', 'hong@naver.com');
    fill('login-password', 'pw123456');
    fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByText(copy.result.verdict.likely_ai.headline)).toBeTruthy();
    const d = calls.find((c) => path(c) === '/v1/detect')!;
    expect(d.body).toEqual({ url: '제목 https://youtube.com/shorts/abc123', source: 'share' });
    expect(d.headers.Authorization).toBe('Bearer T2');
    expect(screen.getByText(copy.result.reshareButton)).toBeTruthy();
  });

  it('확인 중 401 → 토큰 삭제, 로그인(풀림 안내) → 로그인 후 하던 확인을 이어서', async () => {
    seedLoggedIn('OLD');
    const clipboard = require('expo-clipboard').getStringAsync as jest.Mock;
    clipboard.mockResolvedValue('https://youtube.com/shorts/abc123');
    let expired = true;
    const calls = mockServer((c) => {
      if (path(c) === '/v1/auth/login') return { status: 200, body: { token: 'NEW', user: USER } };
      if (path(c) === '/v1/detect') return expired ? err(401, 'unauthorized') : { status: 200, body: SAMPLE };
      return undefined;
    });
    render(<App />);
    fireEvent.press(await screen.findByText(copy.home.pasteButton));
    expect(await screen.findByText(copy.auth.login.expiredNote)).toBeTruthy();
    await waitFor(() => expect(storedToken()).toBeNull());
    expired = false;
    fill('login-email', 'hong@naver.com');
    fill('login-password', 'pw123456');
    fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByText(copy.result.verdict.likely_ai.headline)).toBeTruthy();
    const detects = calls.filter((c) => path(c) === '/v1/detect');
    expect(detects.map((c) => c.headers.Authorization)).toEqual(['Bearer OLD', 'Bearer NEW']);
    expect(detects[1].body).toEqual({ url: 'https://youtube.com/shorts/abc123', source: 'paste' });
  });

  it('내 기록: 목록 → 무한 스크롤(before 커서) → 항목 → 요약 → 지우기', async () => {
    seedLoggedIn();
    const calls = mockServer((c) => {
      const p = path(c);
      if (p === '/v1/history?limit=20') return { status: 200, body: { items: [item('h1'), item('h2', { verdict: 'likely_real', ai_probability: 0.1 })], next: 'C2' } };
      if (p === '/v1/history?limit=20&before=C2') return { status: 200, body: { items: [item('h3', { url: null, platform: 'upload' })], next: null } };
      if (c.method === 'DELETE') return { status: 204 };
      return undefined;
    });
    render(<App />);
    fireEvent.press(await screen.findByText(copy.home.historyLink));
    expect(await screen.findByTestId('history-item-h1')).toBeTruthy();
    expect(screen.getByText(copy.result.verdict.likely_real.headline)).toBeTruthy();
    expect(calls[0].headers.Authorization).toBe(`Bearer ${TEST_TOKEN}`);
    act(() => {
      screen.getByTestId('history-list').props.onEndReached();
    });
    expect(await screen.findByTestId('history-item-h3')).toBeTruthy();
    expect(screen.getByText(copy.history.uploadedVideo)).toBeTruthy();
    fireEvent.press(screen.getByTestId('history-item-h1'));
    expect(screen.getByTestId('history-detail')).toBeTruthy();
    expect(screen.getByText('AI 가능성 87%')).toBeTruthy();
    expect(screen.getByText(copy.history.detail.recheckButton)).toBeTruthy();
    fireEvent.press(screen.getByText(copy.history.detail.deleteButton));
    expect(screen.getByText(copy.history.detail.deleteConfirm)).toBeTruthy();
    fireEvent.press(screen.getByTestId('history-delete-yes'));
    expect(await screen.findByTestId('history-list')).toBeTruthy();
    expect(screen.queryByTestId('history-item-h1')).toBeNull();
    expect(screen.getByTestId('history-item-h2')).toBeTruthy();
    expect(calls.find((c) => c.method === 'DELETE')!.url).toMatch(/\/v1\/history\/h1$/);
  });

  it('내 기록: 다시 확인하기 → 그 주소로 확인', async () => {
    seedLoggedIn();
    const calls = mockServer((c) => {
      if (path(c).startsWith('/v1/history')) return { status: 200, body: { items: [item('h1')], next: null } };
      if (path(c) === '/v1/detect') return { status: 200, body: SAMPLE };
      return undefined;
    });
    render(<App />);
    fireEvent.press(await screen.findByText(copy.home.historyLink));
    fireEvent.press(await screen.findByTestId('history-item-h1'));
    fireEvent.press(screen.getByText(copy.history.detail.recheckButton));
    expect(await screen.findByText(copy.result.verdict.likely_ai.headline)).toBeTruthy();
    expect(calls.find((c) => path(c) === '/v1/detect')!.body).toEqual({ url: 'https://youtube.com/shorts/h1', source: 'paste' });
  });

  it('내 기록: 비었으면 안내', async () => {
    seedLoggedIn();
    mockServer(() => ({ status: 200, body: { items: [], next: null } }));
    render(<App />);
    fireEvent.press(await screen.findByText(copy.home.historyLink));
    expect(await screen.findByText(copy.history.emptyTitle)).toBeTruthy();
  });

  it('내 계정: 이메일·기기 목록(이 기기 표시) → 로그아웃 → 토큰 삭제 → 로그인 화면', async () => {
    seedLoggedIn();
    const calls = mockServer((c) => {
      if (path(c) === '/v1/me')
        return {
          status: 200,
          body: {
            user: USER,
            devices: [
              { id: 'd2', device_name: 'Chrome 확장', last_used_at: '2026-10-18T01:00:00Z', current: false },
              { id: 'd1', device_name: 'Android 앱 (Pixel 8)', last_used_at: '2026-10-19T01:00:00Z', current: true },
            ],
          },
        };
      if (path(c) === '/v1/auth/logout') return { status: 204 };
      return undefined;
    });
    render(<App />);
    fireEvent.press(await screen.findByText(copy.home.accountLink));
    expect(await screen.findByText(USER.email)).toBeTruthy();
    expect(screen.getByText('Chrome 확장')).toBeTruthy();
    expect(screen.getByText(copy.account.currentDevice)).toBeTruthy();
    fireEvent.press(screen.getByText(copy.account.logoutButton));
    expect(await screen.findByText(copy.auth.login.title)).toBeTruthy();
    expect(storedToken()).toBeNull();
    const lo = calls.find((c) => path(c) === '/v1/auth/logout')!;
    expect(lo.headers.Authorization).toBe(`Bearer ${TEST_TOKEN}`);
    expect(screen.queryByText(copy.auth.login.expiredNote)).toBeNull();
  });

  it('기록 화면에서 401 → 로그인 화면(풀림 안내)', async () => {
    seedLoggedIn();
    mockServer((c) => (path(c).startsWith('/v1/history') ? err(401, 'unauthorized') : undefined));
    render(<App />);
    fireEvent.press(await screen.findByText(copy.home.historyLink));
    expect(await screen.findByText(copy.auth.login.expiredNote)).toBeTruthy();
    expect(storedToken()).toBeNull();
  });
});
