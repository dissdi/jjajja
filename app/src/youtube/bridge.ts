// WebView ↔ 앱 메시지. 유튜브 모바일 웹은 SPA라 쇼츠를 넘겨도 페이지 로드가 없다 →
// history.pushState/replaceState/popstate 후킹 + 짧은 주기 location 확인으로 주소 변화를 앱에 알린다.
// onNavigationStateChange 도 보조로 쓴다(YoutubeScreen).

export const BRIDGE_MESSAGE_TYPE = 'jjajja:url';

/** 주소 확인 주기(ms). 후킹이 놓친 변화를 잡는 안전망 */
export const POLL_MS = 400;

/** WebView에 주입하는 스크립트. 페이지마다 한 번만 설치되도록 가드한다. 마지막 `true;`는 iOS 요구사항 */
export const INJECTED_JS = `
(function () {
  try {
    if (window.__jjajjaHooked) return;
    window.__jjajjaHooked = true;
    var last = '';
    function send(reason) {
      var href = String(location.href);
      if (href === last) return;
      last = href;
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: '${BRIDGE_MESSAGE_TYPE}', url: href, reason: reason }));
      }
    }
    ['pushState', 'replaceState'].forEach(function (k) {
      var orig = history[k];
      if (typeof orig !== 'function') return;
      history[k] = function () {
        var r = orig.apply(this, arguments);
        setTimeout(function () { send(k); }, 0);
        return r;
      };
    });
    window.addEventListener('popstate', function () { send('popstate'); });
    window.addEventListener('yt-navigate-finish', function () { send('yt-navigate-finish'); });
    setInterval(function () { send('poll'); }, ${POLL_MS});
    send('init');
  } catch (e) {}
})();
true;
`;

/** WebView onMessage 의 data → 주소. 우리 메시지가 아니면 null */
export function parseBridgeMessage(data: unknown): string | null {
  if (typeof data !== 'string') return null;
  try {
    const msg = JSON.parse(data) as unknown;
    if (!msg || typeof msg !== 'object') return null;
    const { type, url } = msg as { type?: unknown; url?: unknown };
    if (type !== BRIDGE_MESSAGE_TYPE || typeof url !== 'string' || url === '') return null;
    return url;
  } catch {
    return null;
  }
}

/** WebView 안에서 열어도 되는 주소인가. intent://, vnd.youtube:// 등 앱 열기 시도는 막아 앱 안에 머문다 */
export function isAllowedInWebView(url: string): boolean {
  return /^(https?:|about:|data:|blob:)/i.test(url);
}
