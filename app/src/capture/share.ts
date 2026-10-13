// 공유하기로 탐지 (GitHub #12 기능 3) — 순수 로직. 네이티브 수신은 expo-share-intent(config plugin)가 맡고,
// 여기서는 받은 값을 "서버에 보낼 텍스트"와 "다시 보낼 때 쓸 원래 링크"로 바꾼다.
// 원칙 (mobile-capture 스킬): 공유 문구는 손대지 않고 그대로 서버에 보낸다 — URL 추출·단축 링크 해석은 서버 몫.
//   예) 유튜브: "제목 텍스트 https://youtube.com/shorts/abc?si=x" / 카카오톡: "https://kko.to/xyz" 같은 단축 링크

import type { DetectSource } from '../api/contract';
import { extractUrl } from '../ux/present';

/** expo-share-intent의 ShareIntent에서 쓰는 부분만 (라이브러리 타입에 묶이지 않게 최소 구조) */
export interface SharedPayload {
  text?: string | null;
  webUrl?: string | null;
}

export const SHARE_SOURCE: DetectSource = 'share';

/**
 * 서버로 보낼 텍스트. 받은 텍스트를 앞뒤 공백만 다듬어 그대로 쓴다.
 * - iOS에서 링크만(weburl) 오고 text가 없으면 webUrl
 * - text에 주소가 없는데 webUrl이 따로 왔으면(iOS 웹페이지 공유) 둘을 이어 붙여 서버가 주소를 찾게 한다
 * - 보낼 게 없으면 null (텍스트가 아닌 공유 — 지금은 받지 않음)
 */
export function sharedTextFrom(p: SharedPayload | null | undefined): string | null {
  if (!p) return null;
  const text = (p.text ?? '').trim();
  const webUrl = (p.webUrl ?? '').trim();
  if (!text) return webUrl || null;
  if (webUrl && !text.includes(webUrl) && !/https?:\/\//i.test(text)) return `${text} ${webUrl}`;
  return text;
}

/**
 * 다시 보내기 문구에 넣을 "원래 링크". 공유 문구에서 첫 주소만 꺼낸다(제목 등은 빼서 메시지를 짧게).
 * 단축 링크는 받은 그대로 둔다 — 받는 사람이 보낸 사람과 같은 링크를 보게.
 * 주소를 못 찾으면 받은 텍스트 그대로 (서버는 결과를 냈으므로 링크 역할을 하는 무언가는 있다).
 */
export function originalLinkFrom(sharedText: string): string {
  return extractUrl(sharedText) ?? sharedText.trim();
}

/** 공유 진입 결정: 들어온 공유 → 바로 확인 시작(run) 또는 무시 */
export type ShareEntryDecision = { kind: 'run'; text: string } | { kind: 'ignore' };

/**
 * 공유 진입 상태 로직.
 * - 보낼 텍스트가 없으면 무시
 * - 방금 처리한 것과 같은 공유(같은 값이 effect 재실행으로 다시 들어옴)는 무시 → 같은 요청 두 번 방지
 * 사용자가 확인 중이거나 결과를 보는 중이라도 새 공유가 오면 새로 확인한다 (App.run이 이전 요청을 취소).
 */
export function decideShareEntry(
  hasShareIntent: boolean,
  payload: SharedPayload | null | undefined,
  lastHandled: string | null,
): ShareEntryDecision {
  if (!hasShareIntent) return { kind: 'ignore' };
  const text = sharedTextFrom(payload);
  if (text === null || text === lastHandled) return { kind: 'ignore' };
  return { kind: 'run', text };
}
