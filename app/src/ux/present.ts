// 결과 표시 규칙 (UX 명세 §3.2, §4, §5.6). 순수 함수 — 테스트: __tests__/present.test.ts
// verdict는 서버 값을 그대로 쓴다. 여기서 ai_probability로 verdict를 계산하지 않는다.

import type { DetectResponse, Signal, Verdict } from '../api/contract';
import { copy, fill } from './copy';

/** 클라이언트 검증은 "http(s) URL 형태인가"까지만 (명세 §2.1.1) */
export function looksLikeUrl(text: string): boolean {
  const t = text.trim();
  if (!/^https?:\/\/\S+$/i.test(t)) return false;
  return /^https?:\/\/[^\s/?#]+\.[^\s/?#]+/i.test(t);
}

/**
 * 붙여넣은 텍스트에서 서버로 보낼 주소를 꺼낸다. 없으면 null (→ 인라인 오류 notUrl).
 * 일부러 느슨하게 거른다: 도메인·플랫폼 판정은 서버 몫이고(invalid_url/unsupported_platform),
 * 서버가 받는 링크를 앱이 거부하면 안 된다 (source-rule-engineer 통지, 2026-09-28).
 * 1) 텍스트 안의 첫 http(s) 주소, 2) 없으면 'youtu.be/abc' 처럼 scheme 없는 도메인 형태 토큰을 그대로.
 */
export function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"']+/i);
  if (m && looksLikeUrl(m[0])) return m[0];
  const bare = text.split(/\s+/).find((tok) => /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(tok));
  return bare ?? null;
}

/** pct = clamp(round(p*100), 1, 99). null이면 null (명세 §3.2, A5) */
export function percentOf(p: number | null): number | null {
  if (p === null || !Number.isFinite(p)) return null;
  return Math.min(99, Math.max(1, Math.round(p * 100)));
}

export function percentLabel(p: number | null): string | null {
  const pct = percentOf(p);
  return pct === null ? null : fill(copy.result.percentLabel, { pct });
}

/** 근거 선택: status=ok, 공백 아님, 중복 제거, verdict별 정렬, 최대 3개 (명세 §4) */
export function selectEvidence(verdict: Verdict, signals: Signal[]): string[] {
  if (verdict === 'unknown') return [];
  const seen = new Set<string>();
  const cands: { s: Signal; i: number }[] = [];
  signals.forEach((s, i) => {
    const text = s.evidence_ko.trim();
    if (s.status !== 'ok' || text === '' || seen.has(text)) return;
    seen.add(text);
    cands.push({ s, i });
  });
  const key =
    verdict === 'likely_real'
      ? (s: Signal) => (1 - s.score) * s.weight
      : (s: Signal) => s.score * s.weight;
  cands.sort((a, b) => {
    if (verdict !== 'likely_real' && a.s.decisive !== b.s.decisive) return a.s.decisive ? -1 : 1;
    const d = key(b.s) - key(a.s);
    return d !== 0 ? d : a.i - b.i;
  });
  return cands.slice(0, 3).map((c) => c.s.evidence_ko.trim());
}

/**
 * partial 안내 문구. partial=false면 null.
 * URL로 확인했고 영상 화면 확인(kind=model) 신호가 하나도 ok가 아니면 partialNoVideo,
 * 그 외에는 명세의 partialNote.
 */
export function partialNoteFor(res: DetectResponse, fromUpload: boolean): string | null {
  if (!res.partial) return null;
  const modelOk = res.signals.some((s) => s.kind === 'model' && s.status === 'ok');
  if (!fromUpload && !modelOk) return copy.result.partialNoVideo;
  return copy.result.partialNote;
}

/** 공유 텍스트 (명세 §5.6). url=null이면 영상 파일로 확인한 경우 */
export function buildShareText(res: DetectResponse, url: string | null): string {
  const v = copy.result.verdict[res.verdict];
  const pl = percentLabel(res.ai_probability);
  const evidence = selectEvidence(res.verdict, res.signals);
  let tpl: string = copy.share.template;
  if (pl === null) tpl = tpl.replace(' ({percentLabel})', '');
  if (evidence.length === 0) tpl = tpl.replace('{evidenceBlock}\n', '');
  if (url === null) tpl = tpl.replace('영상 주소: {url}', copy.share.uploadedVideoLine);
  return fill(tpl, {
    appName: copy.app.name,
    headline: v.headline,
    percentLabel: pl ?? '',
    sub: v.sub,
    evidenceBlock: evidence.map((e) => fill(copy.share.evidenceLine, { evidence: e })).join('\n'),
    url: url ?? '',
    footer: fill(copy.share.footer, { appName: copy.app.name }),
  });
}
