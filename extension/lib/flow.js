// 팝업 화면 상태 전이 (순수 함수). popup.js 는 이 상태를 그리기만 한다.
//
// boot ─status(로그인 안 됨)→ login ─auth_ok→ loading(바로 현재 영상 확인)
//      └status(로그인 됨)──────────────────→ loading ─detect_done→ result | error
// 어디서든 응답이 auth_required(401·토큰 없음) → login (만료면 안내 문구)
// result/error ─history_open→ history ─history_back→ 이전 화면
// 어디서든 logout → login
import { authErrorToDisplay } from './display.js';

export const SCREENS = ['boot', 'login', 'loading', 'result', 'error', 'history'];

export const initialState = () => ({
  screen: 'boot',
  authMode: 'login', // 'login' | 'signup'
  pending: false, // 로그인 요청 중
  authError: null, // authErrorToDisplay 결과
  notice: null, // 'expired' — 로그인 화면 위 안내
  email: null,
  detect: null, // 마지막 detect 응답
  history: null, // { loading, items, error }
  back: null, // history 에서 돌아갈 화면
});

const toLogin = (s, notice = null) => ({
  ...initialState(),
  screen: 'login',
  authMode: 'login',
  notice,
});

const isAuthRequired = (r) => !!r && r.ok === false && r.error && r.error.kind === 'auth_required';

/** @param {ReturnType<typeof initialState>} s @param {{type: string, [k: string]: any}} ev */
export function reduce(s, ev) {
  switch (ev.type) {
    case 'status':
      return ev.loggedIn ? { ...s, screen: 'loading', email: ev.email ?? null } : toLogin(s);

    case 'toggle_mode':
      if (s.screen !== 'login' || s.pending) return s;
      return { ...s, authMode: s.authMode === 'login' ? 'signup' : 'login', authError: null };

    case 'auth_submit':
      if (s.screen !== 'login' || s.pending) return s;
      return { ...s, pending: true, authError: null };

    case 'auth_done': {
      if (s.screen !== 'login') return s;
      const r = ev.response;
      if (r && r.ok) {
        // 성공하면 바로 현재 영상을 확인한다.
        return { ...s, screen: 'loading', pending: false, authError: null, notice: null, email: r.email ?? null };
      }
      const e = authErrorToDisplay(r && r.error);
      return { ...s, pending: false, authError: e, authMode: e.switchTo ?? s.authMode };
    }

    case 'detect_start':
      if (s.screen === 'login' || s.screen === 'boot') return s;
      return { ...s, screen: 'loading', history: null };

    case 'detect_done': {
      const r = ev.response;
      if (isAuthRequired(r)) return toLogin(s, r.error.reason === 'expired' ? 'expired' : null);
      if (s.screen !== 'loading') return s; // 로그아웃 등으로 이미 다른 화면
      return { ...s, screen: r && r.ok ? 'result' : 'error', detect: r ?? { ok: false, error: { kind: 'network' } } };
    }

    case 'history_open':
      if (s.screen !== 'result' && s.screen !== 'error') return s;
      return { ...s, screen: 'history', back: s.screen, history: { loading: true, items: [], error: null } };

    case 'history_done': {
      const r = ev.response;
      if (isAuthRequired(r)) return toLogin(s, r.error.reason === 'expired' ? 'expired' : null);
      if (s.screen !== 'history') return s;
      return {
        ...s,
        history: r && r.ok
          ? { loading: false, items: r.data.items, error: null }
          : { loading: false, items: [], error: (r && r.error) || { kind: 'network' } },
      };
    }

    case 'history_back':
      if (s.screen !== 'history') return s;
      return { ...s, screen: s.back ?? 'result', history: null, back: null };

    case 'logout':
      return toLogin(s);

    default:
      return s;
  }
}
