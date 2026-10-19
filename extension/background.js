// service worker: 확장 버튼 활성/비활성, 로그인 토큰 보관, 서버 호출, 세션 캐시.
// 서버 호출은 여기서만 한다(유튜브 페이지 컨텍스트에서 부르면 CORS·CSP에 걸린다).
import { parseVideoUrl } from './lib/video.js';
import { createService } from './lib/service.js';

const ICON = (state) => ({
  16: `icons/${state}-16.png`,
  32: `icons/${state}-32.png`,
  48: `icons/${state}-48.png`,
  128: `icons/${state}-128.png`,
});
const TITLE_ON = 'AI로 만든 영상인지 확인하기';
const TITLE_OFF = '유튜브 영상 화면에서 쓸 수 있어요';

// 기본은 꺼짐. 영상 탭에서만 탭 단위로 켠다. (service worker 가 깰 때마다 다시 적용해도 무해)
chrome.action.disable();

async function refreshTab(tabId, url) {
  const on = parseVideoUrl(url) !== null;
  try {
    if (on) {
      await chrome.action.enable(tabId);
      await chrome.action.setIcon({ tabId, path: ICON('active') });
      await chrome.action.setTitle({ tabId, title: TITLE_ON });
    } else {
      await chrome.action.disable(tabId);
      await chrome.action.setIcon({ tabId, path: ICON('inactive') });
      await chrome.action.setTitle({ tabId, title: TITLE_OFF });
    }
  } catch {
    // 탭이 이미 닫혔으면 무시
  }
}

async function refreshAllTabs() {
  // tabs 권한 없이도 host_permissions(youtube) 탭은 url 이 보인다. 나머지는 url 이 없어 꺼짐 처리.
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((t) => refreshTab(t.id, t.url)));
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.disable();
  refreshAllTabs();
});
chrome.runtime.onStartup.addListener(() => {
  chrome.action.disable();
  refreshAllTabs();
});

// SPA 이동(pushState)도 changeInfo.url 로 들어온다.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url !== undefined || changeInfo.status !== undefined) {
    refreshTab(tabId, tab.url);
  }
});
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    refreshTab(tabId, tab.url);
  } catch {
    /* 무시 */
  }
});

// ---- 서버 호출·로그인 (lib/service.js) ----
// 토큰은 chrome.storage.local 에만 있고, 서버 호출은 여기서만 한다. 팝업은 메시지로 결과만 받는다.

const service = createService({
  local: chrome.storage.local,
  session: chrome.storage.session,
  getTabUrl: async (tabId) => (await chrome.tabs.get(tabId)).url,
  hasPermission: (pattern) => chrome.permissions.contains({ origins: [pattern] }),
});

const HANDLERS = {
  'auth-status': () => service.status(),
  login: (msg) => service.login(msg),
  signup: (msg) => service.signup(msg),
  logout: () => service.logout(),
  detect: (msg) => service.detect(msg),
  history: (msg) => service.history(msg),
  health: () => service.health(),
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return false;
  if (msg.type === 'yt-nav') {
    if (sender.tab && sender.tab.id !== undefined) refreshTab(sender.tab.id, msg.url);
    return false;
  }
  // 로그인·확인·기록은 확장 자신의 페이지(팝업·옵션)에서 온 메시지만 받는다. content script(유튜브 페이지)는 yt-nav 만.
  if (sender.id !== chrome.runtime.id || !(sender.url || '').startsWith(chrome.runtime.getURL(''))) return false;
  const h = HANDLERS[msg.type];
  if (!h) return false;
  Promise.resolve()
    .then(() => h(msg))
    .then(sendResponse, () => sendResponse({ ok: false, error: { kind: 'network' } }));
  return true; // 비동기 응답
});
