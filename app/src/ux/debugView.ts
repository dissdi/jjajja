// 개발 모드 표 (EXPO_PUBLIC_DEBUG=1 전용, 계약 v1.3 signals[].debug) — 순수 함수. 테스트: __tests__/debug.test.tsx
// 개발자용 설명 화면이다. 판정(verdict)은 서버 값을 그대로 보여주고, 앱이 확률로 구간을 다시 계산하지 않는다.
// 아래 "계산식"은 서버의 가중 평균을 눈으로 따라가기 위한 설명용 재현일 뿐이다.
// 개발 모드 off 화면(present.ts의 detailRowsFor 등)과 무관하다.

import type { DetectResponse, Signal, SignalStatus, Verdict } from '../api/contract';
import { copy } from './copy';
import { percentOf } from './present';

/** 숫자를 소수 n자리로. null/비유한값은 "null" */
export function fmtNum(v: number | null | undefined, digits: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'null';
  return v.toFixed(digits);
}

/** 가중치: 정수는 그대로, 아니면 소수 셋째까지에서 끝 0 제거 (0.25 → "0.25") */
export function fmtWeight(w: number): string {
  if (Number.isInteger(w)) return String(w);
  return w.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

/** 원점수 값: 정수는 그대로, 실수는 소수 셋째 */
function fmtRawNum(v: number): string {
  return Number.isInteger(v) ? String(v) : fmtNum(v, 3);
}

// ---------------------------------------------------------------------------
// 1. 판정 요약 카드
// ---------------------------------------------------------------------------

export const VERDICT_KO: Record<Verdict, string> = {
  likely_ai: 'AI 가능성 높음',
  uncertain: '판단 어려움',
  likely_real: 'AI 흔적 못 찾음',
  unknown: '분석 불가',
};

export interface DebugSummary {
  verdict: string;
  probability: string;
  partial: string;
  cached: string;
  requestId: string;
}

export function debugSummaryFor(res: DetectResponse): DebugSummary {
  const pct = percentOf(res.ai_probability);
  return {
    verdict: `최종 판정: ${VERDICT_KO[res.verdict]} (${res.verdict})`,
    probability:
      res.ai_probability === null || pct === null
        ? 'AI 가능성 계산 불가 (null)'
        : `AI 가능성 ${fmtNum(res.ai_probability, 4)} (${pct}%)`,
    partial: res.partial
      ? '유튜브 표시만으로 판정 — 영상 화면은 확인 못 함 (partial=true)'
      : '영상 화면까지 확인함 (partial=false)',
    cached: res.cached ? '이전 결과 재사용 — 과금 없음 (cached=true)' : '새로 분석함 (cached=false)',
    requestId: `request_id ${res.request_id}`,
  };
}

// ---------------------------------------------------------------------------
// 2. 계산식 (설명용)
// ---------------------------------------------------------------------------

/** 가중 평균에 들어간 신호: status ok, weight>0, score 있음 */
export function isWeighted(s: Signal): s is Signal & { score: number } {
  return s.status === 'ok' && s.weight > 0 && s.score !== null && Number.isFinite(s.score);
}

export interface DebugCalc {
  /** "(0.631×0.25 + 1.000×1) ÷ (0.25 + 1) = 0.9262". 계산에 들어간 신호가 없으면 안내 문장 */
  formula: string;
  /** 앱이 재현한 가중 평균. 신호 없으면 null */
  computed: number | null;
  /** 서버 최종값과 다를 때만: "서버 정책으로 조정됨: 계산 0.xxxx → 최종 0.yyyy" */
  adjusted: string | null;
  /** decisive 신호가 있을 때만: "확정 신호: id, id" */
  decisive: string | null;
}

export function debugCalcFor(res: DetectResponse): DebugCalc {
  const used = res.signals.filter(isWeighted);
  const sumW = used.reduce((a, s) => a + s.weight, 0);
  const sumWS = used.reduce((a, s) => a + s.weight * s.score, 0);
  const computed = used.length && sumW > 0 ? sumWS / sumW : null;
  const formula =
    computed === null
      ? '계산에 들어간 신호 없음 (비중 0 또는 실패만 있음)'
      : `(${used.map((s) => `${fmtNum(s.score, 3)}×${fmtWeight(s.weight)}`).join(' + ')}) ÷ (${used
          .map((s) => fmtWeight(s.weight))
          .join(' + ')}) = ${fmtNum(computed, 4)}`;
  // 화면에 보이는 소수 넷째 자리 기준으로 비교 (부동소수 오차 무시)
  const same =
    computed !== null && res.ai_probability !== null
      ? fmtNum(computed, 4) === fmtNum(res.ai_probability, 4)
      : computed === res.ai_probability;
  const adjusted = same
    ? null
    : `서버 정책으로 조정됨: 계산 ${fmtNum(computed, 4)} → 최종 ${fmtNum(res.ai_probability, 4)}`;
  const dec = res.signals.filter((s) => s.decisive).map((s) => s.id);
  return { formula, computed, adjusted, decisive: dec.length ? `확정 신호: ${dec.join(', ')}` : null };
}

// ---------------------------------------------------------------------------
// 3~5. 신호 카드 (두 그룹)
// ---------------------------------------------------------------------------

const STATUS_KO: Record<SignalStatus, string> = { ok: '정상', error: '실패', unavailable: '확인 못 함' };

export interface DebugField {
  label: string;
  value: string;
  /** 빨간색 강조 (실패 이유) */
  alert?: boolean;
}

export interface DebugCard {
  key: string;
  /** 한국어 이름 (copy.result.details.names), 없으면 id */
  title: string;
  id: string;
  fields: DebugField[];
  /** debug.raw 풀어 쓴 줄들 */
  rawLines: string[];
  /** status≠ok → 제목 빨간색 */
  alert: boolean;
}

export interface DebugGroup {
  title: string;
  desc: string;
  cards: DebugCard[];
}

export const DEBUG_GROUP_COPY = {
  used: { title: '계산에 들어간 신호', desc: '최종 AI 가능성(가중 평균)에 실제로 들어간 신호예요' },
  excluded: {
    title: '설명용·제외된 신호',
    desc: '비중 0(설명용)이거나 실패·확인 못 해서 계산에서 빠진 신호예요',
  },
} as const;

const RAW_LABELS: Record<string, string> = {
  mean: '프레임 평균',
  top25: '상위 25% 프레임 평균',
  frames: '분석 프레임',
  top_generator: '생성기 추정(참고)',
  audio: 'AI 음성 가능성',
  deepfake: '딥페이크 가능성',
  aggregate: '집계 방식',
  raw: '원점수',
  via: '조회 경로',
  answer_ids: '유튜브 도움말 id',
  attribution: '출처 표시',
  ai_badge: 'AI 배지',
  level: 'AI 언급 강도',
  has_description: '설명란 있음',
};

const AGGREGATE_KO: Record<string, string> = { mean: '평균', top25: '상위 25%' };

function rawValue(v: unknown): string {
  if (v === null || v === undefined) return '없음';
  if (typeof v === 'boolean') return v ? '예' : '아니오';
  if (typeof v === 'number') return fmtRawNum(v);
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(', ') : '없음';
  return JSON.stringify(v);
}

/** debug.raw → 한국어 라벨 줄들. 모르는 키는 key=value 그대로 */
export function rawLinesFor(raw: Record<string, unknown> | null | undefined): string[] {
  if (!raw) return [];
  return Object.entries(raw).map(([k, v]) => {
    const label = RAW_LABELS[k];
    if (label === undefined) {
      const s = typeof v === 'number' ? fmtRawNum(v) : typeof v === 'string' ? v : v == null ? 'null' : JSON.stringify(v);
      return `${k}=${s}`;
    }
    if (k === 'frames' && typeof v === 'number') return `${label} ${v}개`;
    if (k === 'aggregate' && typeof v === 'string') return `${label}: ${AGGREGATE_KO[v] ?? v} (${v})`;
    return `${label}: ${rawValue(v)}`;
  });
}

function scoreText(score: number | null): string {
  if (score === null || !Number.isFinite(score)) return '없음';
  return `${fmtNum(score, 3)} (${Math.round(score * 100)}%)`;
}

function excludeReason(s: Signal): string {
  if (s.status !== 'ok') return STATUS_KO[s.status];
  if (s.weight <= 0) return '비중 0 (설명용)';
  return '점수 없음';
}

function cardFor(s: Signal, i: number, used: boolean, sumWS: number): DebugCard {
  const fields: DebugField[] = [
    { label: '종류', value: s.kind === 'rule' ? '규칙' : '모델' },
    { label: '상태', value: STATUS_KO[s.status], alert: s.status !== 'ok' },
    { label: '점수', value: scoreText(s.score) },
    { label: '비중', value: fmtWeight(s.weight) },
  ];
  if (used && s.score !== null) {
    const share = sumWS > 0 ? (s.weight * s.score) / sumWS : 0;
    fields.push({ label: '기여도', value: `${(share * 100).toFixed(1)}%` });
  }
  if (s.kind === 'rule') {
    fields.push({ label: '표시 찾음', value: s.present === null ? '–' : s.present ? '있음' : '없음' });
  }
  fields.push({ label: '확정 신호', value: s.decisive ? '예' : '아니오' });
  const reason = s.debug?.reason ?? null;
  if (reason !== null || !used) {
    fields.push({ label: '제외·실패 이유', value: reason ?? excludeReason(s), alert: s.status !== 'ok' });
  }
  return {
    key: `${s.id}-${i}`,
    title: copy.result.details.names[s.id] ?? s.id,
    id: s.id,
    fields,
    rawLines: rawLinesFor(s.debug?.raw),
    alert: s.status !== 'ok',
  };
}

/** 두 그룹: 계산에 들어간 신호 먼저, 그다음 설명용·제외 신호. 각 그룹 안은 서버 순서 */
export function debugGroupsFor(res: DetectResponse): { used: DebugGroup; excluded: DebugGroup } {
  const sumWS = res.signals.filter(isWeighted).reduce((a, s) => a + s.weight * s.score, 0);
  const used: DebugCard[] = [];
  const excluded: DebugCard[] = [];
  res.signals.forEach((s, i) => {
    if (isWeighted(s)) used.push(cardFor(s, i, true, sumWS));
    else excluded.push(cardFor(s, i, false, sumWS));
  });
  return {
    used: { ...DEBUG_GROUP_COPY.used, cards: used },
    excluded: { ...DEBUG_GROUP_COPY.excluded, cards: excluded },
  };
}

// ---------------------------------------------------------------------------
// 6. 용어 설명
// ---------------------------------------------------------------------------

export const DEBUG_GLOSSARY: readonly { term: string; desc: string }[] = [
  { term: 'likely_ai', desc: 'AI 가능성 높음 — 확정 신호가 있거나 AI 가능성 75% 이상' },
  { term: 'uncertain', desc: '판단 어려움 — AI 가능성 40% 이상 75% 미만' },
  { term: 'likely_real', desc: 'AI 흔적 못 찾음 — 40% 미만이고 확정 신호 없음 (진짜라는 보증은 아님)' },
  { term: 'unknown', desc: '분석 불가 — 쓸 수 있는 신호가 없어 AI 가능성이 null' },
  { term: 'partial', desc: 'true면 영상 화면(모델)은 하나도 확인 못 하고 링크·표시 정보로만 판정' },
  { term: 'cached', desc: 'true면 같은 영상의 이전 결과를 재사용 — 외부 탐지 서비스 과금 없음' },
  { term: '비중 0 (weight 0)', desc: '설명용 신호. 화면 문구에는 쓰일 수 있지만 가중 평균 계산에서는 빠짐' },
  { term: '확정 신호 (decisive)', desc: 'true면 이 신호 하나로 판정이 정해짐 (예: 공식 AI 표시, AI 제작 기록)' },
];
