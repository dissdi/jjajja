// 팝업: 로그인 필수. 토큰이 있으면 열리자마자 현재 탭을 확인한다(원클릭).
// 토큰은 service worker 만 다룬다 — 팝업은 { loggedIn, email } 과 결과만 받는다.
import {
  AUTH_COPY,
  HISTORY_COPY,
  errorToDisplay,
  fmtNum,
  formatCheckedAgo,
  historyItemView,
  toDisplayModel,
} from './lib/display.js';
import { HISTORY_LIMIT } from './lib/contract.js';
import { initialState, reduce } from './lib/flow.js';
import { INFO_PATHS, MARK_PATHS, markElement, svgIcon } from './lib/marks.js';

const $ = (id) => document.getElementById(id);
const SECTIONS = ['boot', 'login', 'loading', 'result', 'error', 'history'];
const CONTRACT_VERSION = '2.0';

let state = initialState();
let tabId = null;
let timer = null;

const send = (msg) =>
  chrome.runtime.sendMessage(msg).catch(() => ({ ok: false, error: { kind: 'network' } }));

function dispatch(ev) {
  const prev = state;
  state = reduce(state, ev);
  render(prev);
  // 화면이 loading 으로 들어서면 확인을 시작한다(로그인 직후 포함).
  if (state.screen === 'loading' && prev.screen !== 'loading') runDetect(ev.force === true);
}

// ---------- 렌더 ----------

function render(prev) {
  for (const id of SECTIONS) $(id).hidden = id !== state.screen;
  const loggedIn = !['boot', 'login'].includes(state.screen);
  $('account').hidden = !loggedIn;
  $('open-history').hidden = state.screen === 'history' || state.screen === 'loading';
  if (loggedIn && state.email) $('account-who').textContent = AUTH_COPY.loggedInAs(state.email);
  $('account-who').hidden = !state.email;

  if (state.screen === 'login') renderLogin(prev);
  if (state.screen === 'loading') startElapsed();
  else stopElapsed();
  if (state.screen === 'result') renderResult(state.detect);
  if (state.screen === 'error') renderError(state.detect.error);
  if (state.screen === 'history') renderHistory();
  renderDevBand();
}

function renderLogin(prev) {
  const mode = state.authMode;
  const c = AUTH_COPY[mode];
  $('auth-title').textContent = c.title;
  $('auth-lead').textContent = c.lead;
  $('auth-switch-prompt').textContent = c.switchPrompt;
  $('auth-switch').textContent = c.switchButton;
  $('auth-submit').textContent = state.pending ? c.pending : c.submit;
  $('auth-submit').disabled = state.pending;
  $('auth-switch').disabled = state.pending;
  $('email').disabled = state.pending;
  $('password').disabled = state.pending;
  $('password').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';

  const notice = $('auth-notice');
  notice.hidden = state.notice !== 'expired';
  if (!notice.hidden) {
    notice.replaceChildren(svgIcon(document, INFO_PATHS), document.createTextNode(AUTH_COPY.expired));
  }

  const e = state.authError;
  setInlineError('email-error', $('email'), e && e.field === 'email' ? e.message : null);
  setInlineError('password-error', $('password'), e && e.field === 'password' ? e.message : null);
  setInlineError('auth-form-error', null, e && !e.field ? e.message : null);
  // 8자 안내는 회원가입에서만, 같은 내용의 에러가 떠 있으면 숨김
  $('password-hint').hidden = mode !== 'signup' || !!(e && e.field === 'password');

  // 처음 들어왔을 때 / 모드를 바꿨을 때 첫 칸에 포커스
  if (!prev || prev.screen !== 'login' || prev.authMode !== mode) {
    queueMicrotask(() => (e && e.field === 'password' ? $('password') : $('email')).focus());
  } else if (prev.pending && !state.pending && e) {
    queueMicrotask(() => (e.field === 'password' ? $('password') : $('email')).focus());
  }
}

function setInlineError(id, input, message) {
  const el = $(id);
  el.hidden = !message;
  if (message) el.replaceChildren(svgIcon(document, MARK_PATHS.likely_ai), document.createTextNode(message));
  if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function startElapsed() {
  if (timer) return;
  const started = Date.now();
  $('elapsed').textContent = '';
  timer = setInterval(() => {
    const s = Math.floor((Date.now() - started) / 1000);
    $('elapsed').textContent = s >= 5 ? `${s}초 지났어요 (최대 45초)` : '';
  }, 1000);
}

function stopElapsed() {
  clearInterval(timer);
  timer = null;
}

function renderResult(r) {
  const m = toDisplayModel(r.data);
  $('verdict-block').className = `verdict-block v-${m.verdict}`;
  $('mark-slot').replaceChildren(markElement(document, m.verdict));
  $('headline').textContent = m.headline;
  $('percent').textContent = m.percent ?? '';
  $('percent').hidden = !m.percent; // null 이면 줄을 없앤다(괘선은 남김)
  $('sub').textContent = m.sub;

  $('evidence').replaceChildren(
    ...m.evidence.map((t) => {
      const li = document.createElement('li');
      li.textContent = t; // 서버 문자열 — 고딕(Pretendard)으로만
      return li;
    }),
  );
  $('evidence-box').hidden = m.evidence.length === 0;

  const note = $('cache-note');
  note.hidden = !r.fromCache;
  if (r.fromCache) note.textContent = formatCheckedAgo(r.checkedAt, Date.now());

  renderDebug(m, r.data);
}

function renderDebug(m, data) {
  const dbg = $('debug');
  dbg.hidden = !m.debugRows;
  if (!m.debugRows) return;
  $('debug-meta').textContent = `request_id ${data.request_id || '—'} · p=${fmtNum(data.ai_probability, 4)} · ${data.verdict}${data.partial ? ' · partial' : ''}${data.cached ? ' · cached' : ''}`;
  const rows = [];
  for (const row of m.debugRows) {
    const tr = document.createElement('tr');
    if (row.chip === 'FAIL') tr.className = 'fail';
    const td = (text, cls) => {
      const el = document.createElement('td');
      if (cls) el.className = cls;
      if (text instanceof Node) el.appendChild(text);
      else el.textContent = text;
      return el;
    };
    const chip = document.createElement('span');
    chip.className = `dev-chip ${row.chip}`;
    chip.textContent = row.chip;
    tr.append(
      td(row.id, 'id'),
      td(chip),
      td(fmtNum(row.score, 3), 'num'),
      td(String(row.weight), 'num'),
      td(barCell(row), 'bar-cell'),
    );
    rows.push(tr);
    if (row.reason) {
      const tr2 = document.createElement('tr');
      tr2.className = `reason${row.chip === 'FAIL' ? ' fail' : ''}`;
      const c = td(row.reason);
      c.colSpan = 5;
      tr2.appendChild(c);
      rows.push(tr2);
    }
  }
  $('debug-rows').replaceChildren(...rows);
}

function barCell(row) {
  const wrap = document.createDocumentFragment();
  const bar = document.createElement('span');
  bar.className = `bar${row.included ? '' : ' excluded'}${row.decisive ? ' decisive' : ''}`;
  if (row.included) {
    const fill = document.createElement('i');
    fill.style.width = `${Math.max(0, Math.min(1, row.share)) * 100}%`;
    bar.appendChild(fill);
  }
  const val = document.createElement('span');
  val.className = 'bar-val';
  val.textContent = row.included ? `${fmtNum(row.share, 3)}${row.decisive ? ' ◆' : ''}` : '(제외)';
  wrap.append(bar, val);
  return wrap;
}

function renderError(err) {
  const e = errorToDisplay(err);
  $('error-mark-slot').replaceChildren(markElement(document, 'unknown'));
  // 첫 문장은 명조 제목, 나머지는 본문 (모두 고정 문구)
  const i = e.message.indexOf('. ');
  $('error-title').textContent = i > 0 ? e.message.slice(0, i) : e.message;
  $('error-body').textContent = i > 0 ? e.message.slice(i + 2) : '';
  $('error-body').hidden = i <= 0;
  $('error-hint').hidden = !e.hint;
  $('error-hint').textContent = e.hint ?? '';
  $('retry').hidden = !e.canRetry;
  $('error-options').hidden = !e.showOptions;
  // 주 버튼은 하나: 다시 확인이 없으면 설정 열기가 주 버튼
  $('error-options').className = `btn ${e.canRetry ? 'btn-secondary' : 'btn-primary'}`;
}

function renderHistory() {
  const h = state.history;
  $('history-lead').textContent = HISTORY_COPY.lead;
  const status = $('history-status');
  const list = $('history-list');
  if (h.loading) {
    status.hidden = false;
    status.textContent = HISTORY_COPY.loading;
    list.replaceChildren();
    return;
  }
  if (h.error) {
    status.hidden = false;
    const e = errorToDisplay(h.error);
    status.textContent = e.message;
    list.replaceChildren();
    return;
  }
  status.hidden = h.items.length > 0;
  status.textContent = HISTORY_COPY.empty;
  const now = Date.now();
  list.replaceChildren(
    ...h.items.map((item) => {
      const v = historyItemView(item, now);
      const li = document.createElement('li');
      li.appendChild(markElement(document, v.verdict, { bare: true }));
      const main = document.createElement('div');
      main.className = 'item-main';
      const head = document.createElement('p');
      head.className = 'body-strong item-head';
      head.textContent = v.headline;
      main.appendChild(head);
      if (v.percent) {
        const p = document.createElement('p');
        p.className = 'figure';
        p.textContent = v.percent;
        main.appendChild(p);
      }
      const meta = document.createElement('p');
      meta.className = 'caption';
      meta.textContent = v.fileOnly ? [HISTORY_COPY.fileOnly, v.meta].filter(Boolean).join(' · ') : v.meta;
      main.appendChild(meta);
      if (v.url) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn-text';
        b.textContent = HISTORY_COPY.open;
        b.addEventListener('click', () => chrome.tabs.create({ url: v.url }));
        main.appendChild(b);
      }
      li.appendChild(main);
      return li;
    }),
  );
}

let devOrigin = null;
function renderDevBand() {
  const band = $('dev-band');
  const on = !!(state.detect && state.detect.ok && state.detect.data.signals.some((s) => s.debug !== undefined));
  band.hidden = !on || state.screen === 'login';
  if (on) band.textContent = `DEV · api ${devOrigin ?? '?'} · v${CONTRACT_VERSION}`;
}

// ---------- 동작 ----------

async function runDetect(force) {
  if (tabId === null) {
    dispatch({ type: 'detect_done', response: { ok: false, error: { kind: 'not_video' } } });
    return;
  }
  const r = await send({ type: 'detect', tabId, force });
  dispatch({ type: 'detect_done', response: r });
}

async function submitAuth(ev) {
  ev.preventDefault();
  if (state.pending) return;
  const mode = state.authMode;
  const email = $('email').value;
  const password = $('password').value;
  dispatch({ type: 'auth_submit' });
  const r = await send({ type: mode, email, password });
  if (r && r.ok) $('password').value = '';
  dispatch({ type: 'auth_done', response: r });
}

async function openHistory() {
  dispatch({ type: 'history_open' });
  const r = await send({ type: 'history', limit: HISTORY_LIMIT });
  dispatch({ type: 'history_done', response: r });
}

async function logout() {
  $('logout').disabled = true;
  await send({ type: 'logout' });
  $('logout').disabled = false;
  $('password').value = '';
  dispatch({ type: 'logout' });
}

const openOptions = () => chrome.runtime.openOptionsPage();
$('open-options').addEventListener('click', openOptions);
$('error-options').addEventListener('click', openOptions);
$('recheck').addEventListener('click', () => dispatch({ type: 'detect_start', force: true }));
$('retry').addEventListener('click', () => dispatch({ type: 'detect_start', force: true }));
$('auth-form').addEventListener('submit', submitAuth);
$('auth-switch').addEventListener('click', () => dispatch({ type: 'toggle_mode' }));
$('open-history').addEventListener('click', openHistory);
$('history-back').addEventListener('click', () => dispatch({ type: 'history_back' }));
$('logout').addEventListener('click', logout);

(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab ? tab.id : null;
  } catch {
    tabId = null;
  }
  const st = await send({ type: 'auth-status' });
  devOrigin = st && st.server ? st.server : null;
  dispatch({ type: 'status', loggedIn: !!(st && st.loggedIn), email: st ? st.email : null });
})();
