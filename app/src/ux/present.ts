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
  // score=null(ok인데 점수 없는 설명용 신호)은 정렬 가중치 0 → 뒤로 (계약 v1.1: score nullable)
  const key =
    verdict === 'likely_real'
      ? (s: Signal) => (s.score === null ? 0 : (1 - s.score) * s.weight)
      : (s: Signal) => (s.score === null ? 0 : s.score * s.weight);
  cands.sort((a, b) => {
    if (verdict !== 'likely_real' && a.s.decisive !== b.s.decisive) return a.s.decisive ? -1 : 1;
    const d = key(b.s) - key(a.s);
    return d !== 0 ? d : a.i - b.i;
  });
  return cands.slice(0, 3).map((c) => c.s.evidence_ko.trim());
}

/**
 * 결과 화면 모드 (D1, 명세 §3.1a).
 * - 'linkOnly': 주소로 확인(platform != "upload") && verdict == "unknown" && partial == true
 *   → 영상을 받지 못했고 규칙 신호도 없어 다시 해도 같은 결과. 저장한 영상으로 확인하도록 안내.
 * - 'normal': 그 외 전부 (업로드 unknown, partial 아닌 unknown, 다른 verdict 포함) — 기존 표시 그대로.
 */
export type ResultMode = 'normal' | 'linkOnly';
export function resultModeFor(res: DetectResponse): ResultMode {
  return res.platform !== 'upload' && res.verdict === 'unknown' && res.partial ? 'linkOnly' : 'normal';
}

/** 결과 카드의 헤드라인/보조 문장 */
export function headlineFor(res: DetectResponse): { headline: string; sub: string } {
  if (resultModeFor(res) === 'linkOnly') {
    const { headline, sub } = copy.result.linkOnly;
    return { headline, sub };
  }
  return copy.result.verdict[res.verdict];
}

/**
 * partial 안내 문구. partial=false면 null.
 * URL로 확인했고 영상 화면 확인(kind=model) 신호가 하나도 ok가 아니면 partialNoVideo,
 * 그 외에는 명세의 partialNote.
 */
export function partialNoteFor(res: DetectResponse, fromUpload: boolean): string | null {
  if (!res.partial) return null;
  if (resultModeFor(res) === 'linkOnly') return null; // 카드가 이미 같은 내용을 안내함
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

/**
 * 자세히 보기 한 줄 (명세 §2.3a). 기본 화면은 그대로, 접힌 섹션을 펼치면 신호별로 보여준다.
 * - model: 이름 + 'AI 가능성 n%'(percentOf 규칙 재사용) + evidence + 참고용 경고
 * - modelUnavailable: 이름 + '화면 속 장면은 확인하지 못했어요'
 * - rule: 이름 + 있음/없음(present, null이면 생략) + evidence. 규칙 점수 숫자는 보여주지 않는다(0.5 같은 설명용 값이 오해를 줌)
 * name=null이면 모르는 id → evidence만 보여준다.
 */
export interface DetailRow {
  key: string;
  kind: 'model' | 'modelUnavailable' | 'rule';
  name: string | null;
  /** model: 'AI 가능성 n%', rule: '있음'/'없음'(present=null이면 null), 그 외 null */
  value: string | null;
  /** 한 문장 설명 (evidence_ko 또는 modelUnavailable 문구). 없으면 null */
  detail: string | null;
  /** model 행에만: 참고용 경고 */
  caution: string | null;
}

/**
 * 규칙 신호 있음/없음 — 계약 v1.2 `present`만 쓴다 (#2). evidence_ko 문장은 해석하지 않는다.
 * present=null(확인 못 함 또는 구버전 서버)이면 null → 있음/없음 없이 evidence만 보여준다.
 */
function ruleValue(present: boolean | null): string | null {
  if (present === null) return null;
  return present ? copy.result.details.valueYes : copy.result.details.valueNo;
}

export function detailRowsFor(res: DetectResponse): DetailRow[] {
  if (resultModeFor(res) === 'linkOnly') return []; // D1: 보여줄 게 없음
  const d = copy.result.details;
  const rows: DetailRow[] = [];
  res.signals.forEach((s, i) => {
    const key = `${s.id}-${i}`;
    const name = Object.prototype.hasOwnProperty.call(d.names, s.id) ? d.names[s.id] : null;
    const ev = s.evidence_ko.trim() || null;
    if (s.kind === 'model') {
      if (!(s.weight > 0)) return; // 가중치 0(꺼진 모델, 예: d3)은 숨김
      const pct = s.status === 'ok' ? percentLabel(s.score) : null;
      if (pct === null) {
        rows.push({ key, kind: 'modelUnavailable', name, value: null, detail: d.modelUnavailable, caution: null });
      } else {
        rows.push({ key, kind: 'model', name, value: pct, detail: ev, caution: d.modelCaution });
      }
      return;
    }
    if (s.status !== 'ok' || ev === null) return; // 규칙 unavailable/error는 보여줄 결과가 없음
    rows.push({ key, kind: 'rule', name, value: name === null ? null : ruleValue(s.present), detail: ev, caution: null });
  });
  // unknown이면 모델 점수가 있을 때만 의미가 있다
  if (res.verdict === 'unknown' && !rows.some((r) => r.kind === 'model')) return [];
  // 화면 속 장면(모델) 줄을 먼저, 그다음 규칙 줄 (각각 서버 순서 유지). 같은 줄은 중복 제거
  const seen = new Set<string>();
  const rank = (r: DetailRow) => (r.kind === 'rule' ? 1 : 0);
  return [...rows].sort((a, b) => rank(a) - rank(b)).filter((r) => {
    const k = `${r.kind}|${r.name}|${r.value}|${r.detail}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------------------------------------------------------------------------
// 개발 모드 원시 표 (EXPO_PUBLIC_DEBUG=1 전용, 계약 v1.3 signals[].debug)
// 사용자 문구 원칙은 적용하지 않는다 — 영어 id·수치를 그대로 보여준다.
// 개발 모드 off일 때는 쓰이지 않으며, 위 detailRowsFor 등 기존 함수에 영향이 없다.
// ---------------------------------------------------------------------------

/** 숫자를 소수 n자리로. null/비유한값은 "null" */
export function fmtNum(v: number | null | undefined, digits: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'null';
  return v.toFixed(digits);
}

/** debug.raw → 'k=v k=v' 한 줄. 숫자는 소수 셋째 자리까지(정수는 그대로), 객체는 JSON. null/빈 객체면 null */
export function fmtRaw(raw: Record<string, unknown> | null | undefined): string | null {
  if (!raw) return null;
  const parts = Object.entries(raw).map(([k, v]) => {
    let s: string;
    if (typeof v === 'number') s = Number.isInteger(v) ? String(v) : fmtNum(v, 3);
    else if (typeof v === 'string') s = v;
    else if (v === null || v === undefined) s = 'null';
    else s = JSON.stringify(v);
    return `${k}=${s}`;
  });
  return parts.length ? parts.join(' ') : null;
}

/** 표 상단 한 줄: verdict / ai_probability(소수 넷째) / partial / cached / request_id */
export function debugHeaderFor(res: DetectResponse): string {
  return [
    `verdict=${res.verdict}`,
    `ai_probability=${fmtNum(res.ai_probability, 4)}`,
    `partial=${res.partial}`,
    `cached=${res.cached}`,
    `request_id=${res.request_id}`,
  ].join('  ');
}

export interface DebugRow {
  key: string;
  id: string;
  kind: string;
  status: string;
  /** 소수 셋째 자리, null이면 "null" */
  score: string;
  weight: string;
  present: string;
  decisive: string;
  /** debug.reason. 없으면 null (화면에서 강조색) */
  reason: string | null;
  /** debug.raw 한 줄 요약. 없으면 null */
  raw: string | null;
  /** status≠ok 또는 reason 있음 → 화면에서 강조 */
  alert: boolean;
}

/** 모든 신호를 서버 순서대로 (가중치 0, unavailable/error 포함). 필터·정렬·중복 제거 없음 */
export function debugRowsFor(res: DetectResponse): DebugRow[] {
  return res.signals.map((s, i) => {
    const reason = s.debug?.reason ?? null;
    return {
      key: `${s.id}-${i}`,
      id: s.id,
      kind: s.kind,
      status: s.status,
      score: fmtNum(s.score, 3),
      weight: Number.isInteger(s.weight) ? String(s.weight) : fmtNum(s.weight, 3),
      present: s.present === null ? 'null' : String(s.present),
      decisive: String(s.decisive),
      reason,
      raw: fmtRaw(s.debug?.raw),
      alert: s.status !== 'ok' || reason !== null,
    };
  });
}
