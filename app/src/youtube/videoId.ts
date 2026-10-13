// 앱 안 유튜브(시연) — WebView 주소에서 영상 ID를 꺼낸다. 순수 함수 — 테스트: __tests__/youtube.test.ts
// RN의 URL 구현은 searchParams 등이 불완전해서 정규식으로 파싱한다.

export interface YoutubeVideo {
  id: string;
  kind: 'shorts' | 'watch';
  /** 서버로 보낼 주소 (추적 파라미터 없는 표준형) */
  url: string;
}

/** 유튜브 영상 ID는 11자 [A-Za-z0-9_-] */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function make(id: string, kind: YoutubeVideo['kind']): YoutubeVideo {
  return {
    id,
    kind,
    url: kind === 'shorts' ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`,
  };
}

/**
 * 영상 페이지 주소면 {id, kind, url}, 아니면(홈·검색·채널 등) null.
 * - (m.|www.)youtube.com/shorts/<id>
 * - (m.|www.)youtube.com/watch?v=<id>
 * - youtu.be/<id>
 */
export function youtubeVideoFromUrl(raw: string | null | undefined): YoutubeVideo | null {
  if (!raw) return null;
  const m = raw.trim().match(/^https?:\/\/(?:[^@/?#]*@)?([^/?#]+)([^?#]*)(\?[^#]*)?/i);
  if (!m) return null;
  const host = m[1].toLowerCase().replace(/:\d+$/, '');
  const path = m[2] || '/';
  const query = m[3] ?? '';

  if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
    const s = path.match(/^\/shorts\/([^/]+)\/?$/);
    if (s) return VIDEO_ID.test(s[1]) ? make(s[1], 'shorts') : null;
    if (/^\/watch\/?$/.test(path)) {
      const v = query.match(/[?&]v=([^&]*)/);
      return v && VIDEO_ID.test(v[1]) ? make(v[1], 'watch') : null;
    }
    return null;
  }
  if (host === 'youtu.be') {
    const s = path.match(/^\/([^/]+)\/?$/);
    return s && VIDEO_ID.test(s[1]) ? make(s[1], 'watch') : null;
  }
  return null;
}
