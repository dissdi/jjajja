// 응답 → 팝업 표시 모델, 에러 → 문구 (순수 함수).
// 문구 기준: .claude/skills/senior-ux-korean/SKILL.md (확률 표현 표, 에러 문구 표)

export const VERDICT_VIEW = {
  likely_ai: {
    tone: 'red',
    icon: '!',
    headline: 'AI로 만든 영상일 가능성이 높아요',
    sub: '다른 분께 보내기 전에 한 번 더 생각해 주세요',
  },
  uncertain: {
    tone: 'yellow',
    icon: '?',
    headline: 'AI로 만들었는지 확실하지 않아요',
    sub: '출처가 확실한 곳에서 같은 내용을 찾아보세요',
  },
  likely_real: {
    tone: 'green',
    icon: '✓',
    headline: 'AI로 만든 흔적은 찾지 못했어요',
    sub: '그래도 내용이 사실인지는 따로 확인이 필요해요',
  },
  unknown: {
    tone: 'gray',
    icon: '–',
    headline: '이 영상은 확인하지 못했어요',
    sub: '잠시 후 다시 시도해 주세요',
  },
};

// D1: 주소로 확인 + unknown + partial → 다시 해도 같다. 확장에는 파일 업로드가 없어 앱 안내로 바꾼다.
export const URL_ONLY_VIEW = {
  tone: 'gray',
  icon: '–',
  headline: '이 영상은 주소만으로는 확인이 어려워요',
  sub: '영상 파일이 있다면 휴대폰 앱에서 파일로 확인할 수 있어요',
};

export const MAX_EVIDENCE = 3;

/** 0.87 → "AI 가능성 87%" */
export function formatPercent(p) {
  if (typeof p !== 'number' || !Number.isFinite(p)) return null;
  const clamped = Math.min(1, Math.max(0, p));
  return `AI 가능성 ${Math.round(clamped * 100)}%`;
}

/**
 * @param {object} res parseDetectResponse 결과
 * @returns {{
 *   verdict: string, tone: string, icon: string, headline: string, sub: string,
 *   percent: string | null, evidence: string[], urlOnly: boolean,
 *   debugRows: Array<{id:string,status:string,score:number|null,weight:number,reason:string|null}> | null
 * }}
 */
export function toDisplayModel(res) {
  const urlOnly = res.verdict === 'unknown' && res.partial === true && res.platform !== 'upload';
  const view = urlOnly ? URL_ONLY_VIEW : VERDICT_VIEW[res.verdict] ?? VERDICT_VIEW.unknown;

  // 근거: status ok 이고 문장이 있는 신호만, decisive 먼저, 최대 3개.
  // 꺼진 모델(kind=model, weight 0)은 판정에 안 쓰였으므로 숨긴다(senior-ux-korean '자세히 보기' 규칙과 동일).
  const ok = res.signals
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.status === 'ok' && typeof s.evidence_ko === 'string' && s.evidence_ko.trim() !== '')
    .filter(({ s }) => !(s.kind === 'model' && s.weight === 0));
  ok.sort((a, b) => Number(b.s.decisive) - Number(a.s.decisive) || a.i - b.i);
  const evidence = urlOnly ? [] : ok.slice(0, MAX_EVIDENCE).map(({ s }) => s.evidence_ko.trim());

  // 개발자용: 서버가 debug 를 하나라도 보냈을 때만 전체 신호를 그대로 보여준다.
  const hasDebug = res.signals.some((s) => s.debug !== undefined);
  const debugRows = hasDebug ? toDebugRows(res.signals) : null;

  return {
    verdict: res.verdict,
    tone: view.tone,
    icon: view.icon,
    headline: view.headline,
    sub: view.sub,
    percent: urlOnly ? null : formatPercent(res.ai_probability),
    evidence,
    urlOnly,
    debugRows,
  };
}

/** 계산에 들어간 신호: weight > 0, status ok, score 숫자 */
const isIncluded = (s) => s.weight > 0 && s.status === 'ok' && typeof s.score === 'number';

/**
 * 개발자용 행 (design-system.md §7.3). share = weight·score / Σweight(계산에 들어간 신호).
 * chip: weight 0 → SKIP, status≠ok → FAIL, 그 밖 → OK.
 */
export function toDebugRows(signals) {
  const total = signals.filter(isIncluded).reduce((a, s) => a + s.weight, 0);
  return signals.map((s) => {
    const included = isIncluded(s) && total > 0;
    return {
      id: s.id,
      status: s.status,
      score: s.score,
      weight: s.weight,
      reason: s.debug ? s.debug.reason : null,
      chip: s.weight === 0 ? 'SKIP' : s.status !== 'ok' ? 'FAIL' : 'OK',
      decisive: s.decisive === true,
      included,
      share: included ? (s.weight * s.score) / total : null,
    };
  });
}

/** 개발자용 숫자: 고정 소수 자리 (null → —) */
export function fmtNum(v, digits) {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—';
}

/** 캐시에서 꺼낸 결과 안내. at/now: ms */
export function formatCheckedAgo(at, now) {
  const min = Math.floor(Math.max(0, now - at) / 60000);
  if (min < 1) return '방금 확인한 결과예요';
  if (min < 60) return `${min}분 전에 확인한 결과예요`;
  return `${Math.floor(min / 60)}시간 전에 확인한 결과예요`;
}

const ERROR_TEXT = {
  invalid_url: "영상 주소가 아닌 것 같아요. 유튜브 영상 화면에서 다시 눌러 주세요",
  unsupported_platform: '아직 이 사이트의 영상은 확인할 수 없어요. 지금은 유튜브 영상을 확인할 수 있어요',
  video_unavailable: '영상을 열 수 없어요. 삭제되었거나 비공개 영상일 수 있어요',
  file_too_large: '영상이 너무 크거나 길어요. 3분 이내의 짧은 영상을 골라 주세요',
  invalid_file: '이 영상 파일은 열 수 없어요. 다른 영상으로 다시 확인해 주세요',
  rate_limited: '잠시 후 다시 시도해 주세요',
  detectors_down: '지금은 확인이 어려워요. 잠시 후 다시 시도해 주세요',
  // v2.0 — 확인 화면에서는 보통 로그인 화면으로 넘어가지만 문구는 둔다
  unauthorized: '다시 로그인해 주세요',
  not_found: '찾는 기록이 없어요. 이미 지워졌을 수 있어요',
};
const FALLBACK = ERROR_TEXT.detectors_down;

/**
 * 확장 내부 에러 객체 → 화면 문구.
 * err.kind: 'api' (code 포함) | 'network' | 'timeout' | 'bad_response' | 'permission' | 'not_video' | 'no_server'
 * @returns {{ message: string, hint: string | null, showOptions: boolean, canRetry: boolean }}
 */
export function errorToDisplay(err) {
  const kind = err && err.kind;
  switch (kind) {
    case 'api': {
      const message = ERROR_TEXT[err.code] ?? FALLBACK;
      const canRetry = !['invalid_url', 'unsupported_platform', 'video_unavailable', 'not_found'].includes(err.code);
      return { message, hint: null, showOptions: false, canRetry };
    }
    case 'network':
      return {
        message: FALLBACK,
        hint: '확인 서버에 연결하지 못했어요. 설정에서 서버 주소를 확인해 주세요',
        showOptions: true,
        canRetry: true,
      };
    case 'timeout':
      return { message: FALLBACK, hint: '확인이 너무 오래 걸렸어요', showOptions: false, canRetry: true };
    case 'permission':
      return {
        message: '확인 서버를 쓰려면 허락이 필요해요',
        hint: '설정에서 서버 주소를 다시 저장하고 [허용]을 눌러 주세요',
        showOptions: true,
        canRetry: false,
      };
    case 'no_server':
      return {
        message: '확인 서버 주소가 없어요',
        hint: '설정에서 서버 주소를 넣어 주세요',
        showOptions: true,
        canRetry: false,
      };
    case 'not_video':
      return {
        message: '유튜브 영상을 보는 화면에서 눌러 주세요',
        hint: null,
        showOptions: false,
        canRetry: false,
      };
    case 'auth_required':
      return { message: '다시 로그인해 주세요', hint: null, showOptions: false, canRetry: false };
    case 'bad_response':
    default:
      return { message: FALLBACK, hint: null, showOptions: false, canRetry: true };
  }
}

// ---- 로그인 (계약 v2.0) ----
// senior-ux-korean 에 로그인 문구가 아직 없어 같은 원칙(~해요체, 사용자 탓 금지, 다음 행동 제시)으로 썼다.
// NOTES.md "문구 가정" 참고 — senior-ux-designer 검토 대상.
export const AUTH_COPY = {
  login: {
    title: '로그인해 주세요',
    lead: '로그인하면 확인한 영상 기록을 휴대폰 앱에서도 볼 수 있어요',
    submit: '로그인',
    pending: '로그인하고 있어요…',
    switchPrompt: '처음 쓰시나요?',
    switchButton: '회원가입',
  },
  signup: {
    title: '회원가입',
    lead: '이메일과 비밀번호만 있으면 돼요',
    submit: '가입하고 시작하기',
    pending: '가입하고 있어요…',
    switchPrompt: '이미 가입하셨나요?',
    switchButton: '로그인',
  },
  emailLabel: '이메일',
  emailPlaceholder: '예: hong@example.com',
  passwordLabel: '비밀번호',
  passwordHint: '비밀번호는 8자 이상으로 정해 주세요',
  expired: '로그인이 끝났어요. 다시 로그인해 주세요',
  loggedInAs: (email) => `${email} 로 로그인했어요`,
  history: '내 기록',
  logout: '로그아웃',
};

const AUTH_ERROR_TEXT = {
  empty_email: '이메일을 넣어 주세요',
  empty_password: '비밀번호를 넣어 주세요',
  invalid_credentials: '이메일이나 비밀번호가 맞지 않아요. 다시 확인해 주세요',
  email_taken: '이미 가입한 이메일이에요. 로그인해 주세요',
  invalid_email: '이메일 주소를 다시 확인해 주세요. 예: hong@example.com',
  weak_password: '비밀번호를 8자 이상으로 정해 주세요',
  rate_limited: '잠시 후 다시 시도해 주세요',
};

/**
 * 로그인/회원가입 실패 → 입력칸 아래 문구.
 * @returns {{ message: string, field: 'email' | 'password' | null, switchTo: 'login' | null, showOptions: boolean }}
 */
export function authErrorToDisplay(err) {
  const kind = err && err.kind;
  if (kind === 'input' || kind === 'api') {
    const code = err.code;
    const message = AUTH_ERROR_TEXT[code];
    if (message) {
      const field =
        err.field ?? (code === 'invalid_email' ? 'email' : code === 'weak_password' ? 'password' : null);
      return { message, field, switchTo: code === 'email_taken' ? 'login' : null, showOptions: false };
    }
  }
  if (kind === 'network' || kind === 'permission' || kind === 'no_server') {
    const e = errorToDisplay(err);
    return { message: e.hint ? `${e.message}. ${e.hint}` : e.message, field: null, switchTo: null, showOptions: true };
  }
  if (kind === 'timeout') return { message: FALLBACK, field: null, switchTo: null, showOptions: false };
  return { message: FALLBACK, field: null, switchTo: null, showOptions: false };
}

// ---- 내 기록 ----

/** ISO 시각 → "방금 / n분 전 / n시간 전 / 어제 / n일 전 / M월 D일" */
export function formatWhen(iso, now) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const min = Math.floor(Math.max(0, now - t) / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d === 1) return '어제';
  if (d < 7) return `${d}일 전`;
  const dt = new Date(t);
  return `${dt.getMonth() + 1}월 ${dt.getDate()}일`;
}

/** 기록 링크는 유튜브 주소일 때만 연다(서버가 준 임의 주소를 열지 않음). */
function safeVideoUrl(url) {
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return /(^|\.)youtube\.com$|^youtu\.be$/i.test(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

/** 기록 항목 → 한 줄 표시 */
export function historyItemView(item, now) {
  const view = VERDICT_VIEW[item.verdict] ?? VERDICT_VIEW.unknown;
  const when = formatWhen(item.checked_at, now);
  const meta = [when, item.device_name].filter(Boolean).join(' · ');
  return {
    id: item.id,
    verdict: VERDICT_VIEW[item.verdict] ? item.verdict : 'unknown',
    icon: view.icon,
    headline: view.headline,
    percent: item.verdict === 'unknown' ? null : formatPercent(item.ai_probability),
    meta,
    url: safeVideoUrl(item.url),
    fileOnly: item.url === null,
  };
}

export const HISTORY_COPY = {
  title: '내 기록',
  lead: '최근에 확인한 영상 10개예요. 휴대폰 앱에서 확인한 것도 함께 보여요',
  empty: '아직 확인한 영상이 없어요',
  fileOnly: '영상 파일로 확인했어요',
  open: '영상 열기',
  back: '돌아가기',
  loading: '기록을 불러오고 있어요…',
};
