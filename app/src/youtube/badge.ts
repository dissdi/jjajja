// 오버레이 배지에 보일 내용. 순수 함수 — 테스트: __tests__/youtube.test.ts
// verdict는 서버 값 그대로 (확률로 재계산하지 않는다). 색만으로 의미를 전하지 않도록 아이콘·문장을 같이 쓴다.
import type { Verdict } from '../api/contract';
import { copy } from '../ux/copy';
import { headlineFor, percentLabel, resultModeFor } from '../ux/present';
import type { CheckState } from './autoCheck';

export type BadgeView =
  | { kind: 'idle'; label: string; a11yLabel: string }
  | { kind: 'checking'; label: string; a11yLabel: string }
  | { kind: 'result'; verdict: Verdict; label: string; a11yLabel: string }
  | { kind: 'error'; label: string; a11yLabel: string };

export function badgeFor(state: CheckState): BadgeView {
  switch (state.status) {
    case 'idle':
      // 영상이 아닌 화면에서도 배지는 늘 보인다 — 상단 막대 대신 뒤로·나가기를 여는 손잡이 (시연 화면)
      return { kind: 'idle', label: copy.youtube.badgeIdle, a11yLabel: copy.youtube.badgeIdleA11y };
    case 'waiting':
    case 'loading':
      return { kind: 'checking', label: copy.youtube.badgeChecking, a11yLabel: copy.youtube.badgeChecking };
    case 'error':
      return { kind: 'error', label: copy.youtube.badgeError, a11yLabel: copy.youtube.badgeError };
    case 'done': {
      const { data } = state;
      const head = headlineFor(data).headline;
      const pl = data.verdict === 'unknown' || resultModeFor(data) === 'linkOnly' ? null : percentLabel(data.ai_probability);
      const label = pl ?? copy.youtube.badgeUnknown;
      return { kind: 'result', verdict: data.verdict, label, a11yLabel: pl ? `${head}. ${pl}` : head };
    }
  }
}

/** 배지 위치: WebView 영역 기준 오른쪽·위 여백(pt) */
export interface BadgePos {
  right: number;
  top: number;
}

/**
 * 기본 위치: 오른쪽 위. 유튜브 모바일 웹의 상단 막대(검색·메뉴, 약 48pt) 아래에 둬서 겹치지 않게 하고,
 * 쇼츠의 좋아요·댓글 버튼(오른쪽 아래)과도 떨어뜨린다. 사용자가 끌어서 옮길 수 있다.
 */
export const DEFAULT_BADGE_POS: BadgePos = { right: 12, top: 60 };

const EDGE = 4;

/** 끌어서 옮길 때 영역 밖으로 나가지 않게 자른다. 크기를 아직 모르면(0) 그대로 둔다 */
export function clampBadgePos(
  pos: BadgePos,
  area: { width: number; height: number },
  badge: { width: number; height: number },
): BadgePos {
  const clamp = (v: number, max: number) => (max <= EDGE ? v : Math.min(Math.max(v, EDGE), max));
  return {
    right: clamp(pos.right, area.width - badge.width - EDGE),
    top: clamp(pos.top, area.height - badge.height - EDGE),
  };
}
