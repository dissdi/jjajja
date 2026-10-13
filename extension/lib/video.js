// 탭 URL → 유튜브 영상 판별 (순수 함수, 크롬 API 사용 안 함).
// 확장 버튼은 이 함수가 null이 아닐 때만 켠다.

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
// music.youtube.com 은 음악 앱이라 제외. 데스크탑·모바일 웹만.
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);

/**
 * @param {string | undefined | null} rawUrl 탭 URL
 * @returns {{ platform: 'youtube', kind: 'watch' | 'shorts', videoId: string, url: string } | null}
 *   url: 서버에 보낼 정규화 주소 (재생목록·시간·추적 파라미터 제거)
 */
export function parseVideoUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl === '') return null;
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (!HOSTS.has(u.hostname.toLowerCase())) return null;

  const segs = u.pathname.split('/').filter(Boolean);
  if (segs.length === 1 && segs[0] === 'watch') {
    const id = u.searchParams.get('v');
    if (id && VIDEO_ID.test(id)) {
      return { platform: 'youtube', kind: 'watch', videoId: id, url: `https://www.youtube.com/watch?v=${id}` };
    }
    return null;
  }
  if (segs.length >= 2 && segs[0] === 'shorts' && VIDEO_ID.test(segs[1])) {
    const id = segs[1];
    return { platform: 'youtube', kind: 'shorts', videoId: id, url: `https://www.youtube.com/shorts/${id}` };
  }
  return null;
}

/** 세션 캐시 키. watch/shorts 로 같은 영상을 열어도 같은 키. */
export function cacheKey(video) {
  return `result:${video.platform}:${video.videoId}`;
}
