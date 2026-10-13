// 유튜브는 SPA라 영상을 옮겨도 페이지를 새로 불러오지 않는다.
// tabs.onUpdated 가 대부분 잡아주지만, yt-navigate-finish 로 한 번 더 알려 버튼 상태를 확실히 맞춘다.
// 이 스크립트는 페이지 내용을 읽거나 서버를 부르지 않는다.
(() => {
  const notify = () => {
    try {
      chrome.runtime.sendMessage({ type: 'yt-nav', url: location.href }).catch(() => {});
    } catch {
      // 확장을 다시 불러온 직후에는 runtime 이 끊겨 있을 수 있다. 무시.
    }
  };
  document.addEventListener('yt-navigate-finish', notify);
  window.addEventListener('popstate', notify);
  notify();
})();
