// 팝업: 열리자마자 현재 탭으로 확인을 요청한다(원클릭). 서버 호출은 service worker 가 한다.
import { toDisplayModel, errorToDisplay, formatCheckedAgo } from './lib/display.js';

const $ = (id) => document.getElementById(id);
let tabId = null;
let timer = null;

function show(which) {
  for (const id of ['loading', 'result', 'error']) $(id).hidden = id !== which;
}

function startLoading() {
  show('loading');
  const started = Date.now();
  $('elapsed').textContent = '';
  clearInterval(timer);
  timer = setInterval(() => {
    const s = Math.floor((Date.now() - started) / 1000);
    $('elapsed').textContent = s >= 5 ? `${s}초 지났어요 (최대 45초)` : '';
  }, 1000);
}

function stopLoading() {
  clearInterval(timer);
  timer = null;
}

function renderResult(r) {
  const m = toDisplayModel(r.data);
  const badge = $('badge');
  badge.className = `badge tone-${m.tone}`;
  badge.textContent = m.icon;
  $('headline').textContent = m.headline;
  $('sub').textContent = m.sub;
  $('percent').textContent = m.percent ?? '';

  const ul = $('evidence');
  ul.replaceChildren(
    ...m.evidence.map((t) => {
      const li = document.createElement('li');
      li.textContent = t;
      return li;
    }),
  );
  $('evidence-box').hidden = m.evidence.length === 0;

  const note = $('cache-note');
  note.hidden = !r.fromCache;
  if (r.fromCache) note.textContent = formatCheckedAgo(r.checkedAt, Date.now());

  const dbg = $('debug');
  dbg.hidden = !m.debugRows;
  if (m.debugRows) {
    $('debug-rows').replaceChildren(
      ...m.debugRows.map((row) => {
        const tr = document.createElement('tr');
        for (const v of [row.id, row.status, row.score, row.weight, row.reason]) {
          const td = document.createElement('td');
          td.textContent = v === null || v === undefined ? 'null' : String(v);
          tr.appendChild(td);
        }
        return tr;
      }),
    );
  }
  show('result');
}

function renderError(err) {
  const e = errorToDisplay(err);
  $('error-message').textContent = e.message;
  $('error-hint').hidden = !e.hint;
  $('error-hint').textContent = e.hint ?? '';
  $('retry').hidden = !e.canRetry;
  $('error-options').hidden = !e.showOptions;
  show('error');
}

async function run(force) {
  startLoading();
  let r;
  try {
    r = await chrome.runtime.sendMessage({ type: 'detect', tabId, force });
  } catch {
    r = { ok: false, error: { kind: 'network' } };
  }
  stopLoading();
  if (r && r.ok) renderResult(r);
  else renderError((r && r.error) || { kind: 'network' });
}

const openOptions = () => chrome.runtime.openOptionsPage();
$('open-options').addEventListener('click', openOptions);
$('error-options').addEventListener('click', openOptions);
$('recheck').addEventListener('click', () => run(true));
$('retry').addEventListener('click', () => run(true));

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    renderError({ kind: 'not_video' });
    return;
  }
  tabId = tab.id;
  run(false);
})();
