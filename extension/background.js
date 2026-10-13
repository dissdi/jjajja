// service worker: 확장 버튼 활성/비활성, 서버 호출, 세션 캐시.
// 서버 호출은 여기서만 한다(유튜브 페이지 컨텍스트에서 부르면 CORS·CSP에 걸린다).
import { parseVideoUrl, cacheKey } from './lib/video.js';
import { DEFAULT_SERVER, normalizeServer } from './lib/server.js';
import { requestDetect, requestHealth } from './lib/api.js';

const ICON = (state) => ({
  16: `icons/${state}-16.png`,
  32: `icons/${state}-32.png`,
  48: `icons/${state}-48.png`,
  128: `icons/${state}-128.png`,
});
const TITLE_ON = 'AI로 만든 영상인지 확인하기';
const TITLE_OFF = '유튜브 영상 화면에서 쓸 수 있어요';
const SERVER_KEY = 'serverUrl';

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

// ---- 서버 호출 ----

async function getServer() {
  const stored = (await chrome.storage.local.get(SERVER_KEY))[SERVER_KEY];
  return normalizeServer(stored || DEFAULT_SERVER);
}

async function ensurePermission(server) {
  if (server.builtin) return true;
  return chrome.permissions.contains({ origins: [server.pattern] });
}

/** 같은 영상 요청이 동시에 두 번 나가지 않게(팝업을 닫았다 열어도) */
const inflight = new Map();

async function handleDetect({ tabId, force }) {
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return { ok: false, error: { kind: 'not_video' } };
  }
  const video = parseVideoUrl(tab.url);
  if (!video) return { ok: false, error: { kind: 'not_video' } };
  const key = cacheKey(video);

  if (!force) {
    const hit = (await chrome.storage.session.get(key))[key];
    if (hit) return { ok: true, data: hit.data, video, fromCache: true, checkedAt: hit.at };
  }

  const server = await getServer();
  if (!server) return { ok: false, error: { kind: 'no_server' }, video };
  if (!(await ensurePermission(server))) return { ok: false, error: { kind: 'permission' }, video };

  let p = inflight.get(key);
  if (!p) {
    p = (async () => {
      const r = await requestDetect({ origin: server.origin, url: video.url });
      if (r.ok) {
        // 세션 저장소: 브라우저를 닫으면 사라진다(사용자 데이터를 남기지 않음).
        await chrome.storage.session.set({ [key]: { data: r.data, at: Date.now() } });
      }
      return r;
    })().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  const r = await p;
  return r.ok
    ? { ok: true, data: r.data, video, fromCache: false, checkedAt: Date.now() }
    : { ok: false, error: r.error, video };
}

async function handleHealth() {
  const server = await getServer();
  if (!server) return { ok: false, error: { kind: 'no_server' } };
  if (!(await ensurePermission(server))) return { ok: false, error: { kind: 'permission' } };
  const r = await requestHealth({ origin: server.origin });
  return { ...r, origin: server.origin };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return false;
  if (msg.type === 'yt-nav') {
    if (sender.tab && sender.tab.id !== undefined) refreshTab(sender.tab.id, msg.url);
    return false;
  }
  if (msg.type === 'detect') {
    handleDetect(msg).then(sendResponse, () => sendResponse({ ok: false, error: { kind: 'network' } }));
    return true; // 비동기 응답
  }
  if (msg.type === 'health') {
    handleHealth().then(sendResponse, () => sendResponse({ ok: false, status: 0 }));
    return true;
  }
  return false;
});
