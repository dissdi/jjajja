// 옵션 페이지: 서버 주소 저장 + 그 주소에 대해서만 런타임 권한 요청(optional_host_permissions).
import { DEFAULT_SERVER, normalizeServer } from './lib/server.js';
import { MARK_PATHS, svgIcon } from './lib/marks.js';

const SERVER_KEY = 'serverUrl';
const $ = (id) => document.getElementById(id);

function status(text, cls = '') {
  const el = $('status');
  el.className = cls;
  if (cls === 'bad') el.replaceChildren(svgIcon(document, MARK_PATHS.likely_ai), document.createTextNode(text));
  else if (cls === 'ok') el.replaceChildren(svgIcon(document, MARK_PATHS.likely_real), document.createTextNode(text));
  else el.replaceChildren(document.createTextNode(text));
}

async function showAccount() {
  const r = await chrome.runtime.sendMessage({ type: 'auth-status' }).catch(() => null);
  $('account-state').textContent =
    r && r.loggedIn ? `${r.email} 로 로그인했어요` : '로그인하지 않았어요';
}

async function currentServer() {
  const stored = (await chrome.storage.local.get(SERVER_KEY))[SERVER_KEY];
  return normalizeServer(stored || DEFAULT_SERVER);
}

async function save(input) {
  const next = normalizeServer(input);
  if (!next) {
    status('주소 형식이 맞지 않아요. 예: https://abc.trycloudflare.com', 'bad');
    return false;
  }
  // permissions.request 는 클릭 직후(사용자 동작 안)에서 불러야 하므로 다른 await 보다 먼저 부른다.
  if (!next.builtin) {
    let granted = false;
    try {
      granted = await chrome.permissions.request({ origins: [next.pattern] });
    } catch (e) {
      status(`권한 요청에 실패했어요: ${e.message}`, 'bad');
      return false;
    }
    if (!granted) {
      status('허락하지 않으면 이 주소를 쓸 수 없어요', 'bad');
      return false;
    }
  }
  const prev = await currentServer();
  await chrome.storage.local.set({ [SERVER_KEY]: next.origin });
  // 최소 권한: 이전 서버 주소 권한은 돌려준다(같은 호스트가 아닐 때만).
  if (prev && !prev.builtin && prev.pattern !== next.pattern) {
    chrome.permissions.remove({ origins: [prev.pattern] }).catch(() => {});
  }
  $('server').value = next.origin;
  status(`저장했어요: ${next.origin}`, 'ok');
  showAccount(); // 서버가 바뀌면 이전 토큰은 service worker 가 지운다
  return true;
}

async function check() {
  status('연결을 확인하고 있어요…');
  const r = await chrome.runtime.sendMessage({ type: 'health' });
  if (r && r.ok) {
    const detectors = r.body && r.body.detectors ? Object.entries(r.body.detectors).map(([k, v]) => `${k}:${v}`).join(', ') : '';
    status(`연결됐어요 (${r.origin})${detectors ? ` — ${detectors}` : ''}`, 'ok');
  } else if (r && r.error && r.error.kind === 'permission') {
    status('이 주소 사용 허락이 없어요. [저장]을 다시 눌러 허락해 주세요', 'bad');
  } else {
    status(`연결하지 못했어요${r && r.status ? ` (HTTP ${r.status})` : ''}. 서버가 켜져 있는지, 주소가 맞는지 확인해 주세요`, 'bad');
  }
}

$('save').addEventListener('click', () => save($('server').value));
$('check').addEventListener('click', check);
$('reset').addEventListener('click', () => save(DEFAULT_SERVER));

(async () => {
  const s = await currentServer();
  $('server').value = s ? s.origin : DEFAULT_SERVER;
  showAccount();
})();
