// source: _workspace/02_ux_spec.md §5 (문구 표). 키는 명세와 1:1.
// 계약 enum(verdict, error code)은 snake_case 그대로 키로 쓴다.
// [추가] 표시가 붙은 키는 명세에 없어 mobile-engineer가 senior-ux-korean 원칙으로 추가한 것
// (_workspace/03_mobile_notes.md 에 기록). senior-ux-designer 검토 대상.

import type { ContractErrorCode, Verdict } from '../api/contract';

/** 앱 전용 에러 코드 (계약 외) — 명세 §5.5 */
export type AppErrorCode = 'network' | 'timeout' | 'unknown';
export type ErrorCode = ContractErrorCode | AppErrorCode;

interface ErrorCopy {
  title: string;
  body: string;
  button: string;
}

interface VerdictCopy {
  headline: string;
  sub: string;
}

export const copy = {
  app: {
    name: 'jjajja',
  },
  home: {
    title: '이 영상, AI로 만들었을까?',
    subtitle: '유튜브 쇼츠 주소를 넣으면 확인해 드려요',
    inputPlaceholder: '여기에 영상 주소를 넣어 주세요',
    inputA11yLabel: '영상 주소 입력칸',
    clearA11yLabel: '입력한 주소 지우기',
    pasteButton: '복사한 주소 붙여넣기',
    checkButton: '확인하기',
    firstRunHint: "유튜브에서 '공유 → 링크 복사'를 누른 뒤 이 버튼을 눌러 주세요",
    // [추가] 보조 버튼 — 휴대폰에 저장된 영상을 직접 보내 확인
    uploadButton: '영상 파일로 확인하기',
    // [추가] 보조 버튼 아래 한 줄 설명
    uploadHint: '휴대폰에 저장된 영상을 골라 확인할 수 있어요',
    inlineError: {
      clipboardEmpty: "복사한 주소가 없어요. 유튜브에서 '공유 → 링크 복사'를 먼저 눌러 주세요",
      notUrl: "영상 주소가 아닌 것 같아요. 'https://'로 시작하는 주소를 넣어 주세요",
      pasteDenied: "붙여넣기가 허용되지 않았어요. 입력칸을 길게 눌러 '붙여넣기'를 선택해 주세요",
      // [추가] 영상 고르기 화면을 열지 못했을 때
      pickerFailed: '영상을 고르는 화면을 열지 못했어요. 다시 눌러 주세요',
    },
    // [추가·시연] 앱 안 유튜브 진입 버튼 (NOTES-in-app-youtube.md)
    youtubeButton: '유튜브 보면서 확인하기 (시연)',
    youtubeHint: '쇼츠를 넘길 때마다 자동으로 확인해 드려요',
    // [추가·#20] 맨 위 줄 오른쪽 텍스트 버튼
    historyLink: '내 기록',
    accountLink: '내 계정',
  },
  // [추가·#20 로그인] 계약 v2.0 — 로그인 필수. senior-ux-designer 검토 대상
  auth: {
    login: {
      title: '로그인해 주세요',
      subtitle: '로그인하면 확인한 영상 기록을 다른 휴대폰에서도 볼 수 있어요',
      submit: '로그인하기',
      toSignup: '처음이에요, 가입할게요',
      toSignupHint: '이메일과 비밀번호만 있으면 가입할 수 있어요',
      // 공유하기로 들어왔는데 로그인 전일 때
      pendingNote: '로그인하면 보내 주신 영상을 바로 확인해 드려요',
      // 401로 로그인이 풀렸을 때
      expiredNote: '로그인이 풀렸어요. 다시 로그인해 주세요',
    },
    signup: {
      title: '처음 오셨군요',
      subtitle: '자주 쓰는 이메일과 비밀번호를 정해 주세요',
      submit: '가입하기',
      toLogin: '이미 가입했어요, 로그인할게요',
      passwordHint: '비밀번호는 8자 이상으로 정해 주세요',
    },
    emailLabel: '이메일',
    emailPlaceholder: '예: hong@naver.com',
    passwordLabel: '비밀번호',
    passwordPlaceholder: '비밀번호를 넣어 주세요',
    passwordConfirmLabel: '비밀번호 한 번 더',
    passwordConfirmPlaceholder: '같은 비밀번호를 한 번 더 넣어 주세요',
    showPassword: '비밀번호 보기',
    hidePassword: '비밀번호 숨기기',
    submitting: '잠시만 기다려 주세요…',
    /** 계약 v2.0 인증 에러 code + 앱 검사 → 입력칸 아래 문구 */
    error: {
      invalid_credentials: '이메일이나 비밀번호가 맞지 않아요. 다시 확인해 주세요',
      email_taken: '이미 가입된 이메일이에요. 아래 버튼을 눌러 로그인해 주세요',
      invalid_email: "이메일 주소가 맞지 않는 것 같아요. 'hong@naver.com'처럼 넣어 주세요",
      weak_password: '비밀번호는 8자 이상으로 정해 주세요',
      unauthorized: '로그인이 풀렸어요. 다시 로그인해 주세요',
      not_found: '이미 지워졌거나 찾을 수 없는 기록이에요',
      rate_limited: '잠시 후 다시 시도해 주세요',
      network: '인터넷 연결을 확인한 뒤 다시 눌러 주세요',
      timeout: '시간이 너무 오래 걸렸어요. 잠시 후 다시 시도해 주세요',
      unknown: '지금은 처리하기 어려워요. 잠시 후 다시 시도해 주세요',
      // 앱에서 먼저 거르는 경우
      emailEmpty: '이메일을 넣어 주세요',
      passwordEmpty: '비밀번호를 넣어 주세요',
      passwordMismatch: '두 비밀번호가 서로 달라요. 같은 비밀번호를 넣어 주세요',
    },
  },
  // [추가·#20] 내 기록 (GET /v1/history)
  history: {
    title: '내가 확인한 영상',
    subtitle: '다른 휴대폰에서 확인한 영상도 함께 보여요',
    backButton: '처음으로',
    emptyTitle: '아직 확인한 영상이 없어요',
    emptyBody: '처음 화면에서 영상 주소를 넣어 확인해 보세요',
    loading: '기록을 불러오고 있어요…',
    loadMore: '더 불러오고 있어요…',
    loadFailed: '기록을 불러오지 못했어요',
    retryButton: '다시 불러오기',
    uploadedVideo: '휴대폰에 저장된 영상',
    /** {when} · {device} */
    meta: '{when} · {device}',
    itemA11yHint: '눌러서 자세히 봐요',
    detail: {
      title: '확인 기록',
      whenLabel: '확인한 때',
      deviceLabel: '확인한 기기',
      linkLabel: '영상 주소',
      recheckButton: '이 영상 다시 확인하기',
      deleteButton: '이 기록 지우기',
      deleteConfirm: '이 기록을 지울까요? 지우면 되돌릴 수 없어요',
      deleteYes: '지우기',
      deleteNo: '그만두기',
      deleting: '지우고 있어요…',
      backButton: '목록으로',
      unknownSub: '기록에는 결과만 남아 있어요',
    },
  },
  // [추가·#20] 내 계정 (GET /v1/me, 로그아웃)
  account: {
    title: '내 계정',
    emailLabel: '로그인한 이메일',
    devicesTitle: '로그인된 기기',
    devicesHint: '같은 이메일로 로그인한 휴대폰·컴퓨터는 확인 기록을 함께 봐요',
    currentDevice: '지금 이 기기',
    lastUsed: '마지막 사용: {when}',
    loading: '계정 정보를 불러오고 있어요…',
    loadFailed: '계정 정보를 불러오지 못했어요',
    retryButton: '다시 불러오기',
    logoutButton: '로그아웃',
    logoutHint: '로그아웃하면 다시 로그인해야 확인할 수 있어요',
    backButton: '처음으로',
  },
  // [추가·시연] 앱 안 유튜브 화면 (WebView + 오버레이 배지). senior-ux-designer 검토 대상
  youtube: {
    backButton: '뒤로',
    backA11yLabel: '이전 화면으로',
    shortsButton: '쇼츠 처음으로',
    exitButton: '나가기',
    exitA11yLabel: '유튜브 화면 나가기',
    // [추가·상단 막대 제거] 영상이 아닌 화면에서도 배지는 늘 보인다 — 누르면 결과 + 뒤로·쇼츠 처음으로·나가기 시트
    badgeIdle: '쇼츠를 열면 확인해요',
    badgeIdleA11y: '확인 메뉴',
    badgeChecking: '확인 중…',
    badgeUnknown: '확인하지 못했어요',
    badgeError: '확인하지 못했어요',
    badgeA11yHint: '눌러서 결과를 보고, 뒤로 가거나 나갈 수 있어요. 길게 끌어서 자리를 옮길 수 있어요',
    sheetIdle: '쇼츠 영상을 열면 자동으로 확인해 드려요',
    navA11yLabel: '화면 이동',
    sheetClose: '닫고 계속 보기',
    retryButton: '다시 해보기',
    sheetA11yLabel: '확인 결과',
    loadError: '유튜브를 열지 못했어요. 인터넷 연결을 확인한 뒤 다시 눌러 주세요',
    reloadButton: '다시 열기',
    webOnly: {
      title: '휴대폰 앱에서만 동작해요',
      body: '이 기능은 휴대폰에서 jjajja 앱을 열어 사용해 주세요',
      button: '처음으로',
    },
  },
  loading: {
    title: '확인하고 있어요…',
    subtitle: '보통 10초 정도 걸려요',
    // [추가] 영상 파일로 확인할 때의 subtitle (보내는 시간이 더 걸림)
    uploadSubtitle: '영상을 보내는 중이라 조금 더 걸릴 수 있어요',
    slow: '조금 더 걸리고 있어요. 조금만 기다려 주세요',
    // [추가] 경과 시간 (디자인 시스템 §6.2)
    elapsed: '({sec}초 지남)',
    cancelButton: '그만두기',
  },
  result: {
    verdict: {
      likely_ai: {
        headline: 'AI로 만든 영상일 가능성이 높아요',
        sub: '다른 분께 보내기 전에 한 번 더 생각해 주세요',
      },
      uncertain: {
        headline: 'AI로 만들었는지 확실하지 않아요',
        sub: '출처가 확실한 곳에서 같은 내용을 찾아보세요',
      },
      likely_real: {
        headline: 'AI로 만든 흔적은 찾지 못했어요',
        sub: '그래도 내용이 사실인지는 따로 확인이 필요해요',
      },
      unknown: {
        headline: '이 영상은 확인하지 못했어요',
        sub: '잠시 후 다시 시도해 주세요',
      },
    } satisfies Record<Verdict, VerdictCopy>,
    percentLabel: 'AI 가능성 {pct}%',
    evidenceTitle: '이렇게 판단했어요',
    evidenceEmpty: '자세한 이유는 찾지 못했어요',
    partialNote: '일부 확인 방법이 작동하지 않아 결과가 덜 정확할 수 있어요',
    // [추가] partial=true 이고 영상 화면 확인(kind=model)이 하나도 성공하지 못했을 때 (주소로 확인한 경우)
    partialNoVideo:
      "영상 화면 자체는 확인하지 못했어요. 영상을 저장해 두셨다면 '영상 파일로 확인하기'로 더 자세히 볼 수 있어요",
    // [추가·D1] 주소로 확인했는데 unknown + partial (영상을 받지 못했고 규칙 신호도 없음).
    // 다시 해도 같은 결과라 '잠시 후 다시 시도' 대신 저장한 영상으로 확인하도록 안내한다. (명세 §3.1a)
    linkOnly: {
      headline: '이 영상은 주소만으로는 확인이 어려워요',
      sub: '휴대폰에 저장된 영상이 있다면 그 영상으로 확인할 수 있어요',
      saveHint: "카카오톡으로 받은 영상은 영상을 연 뒤 '저장'을 누르면 휴대폰에 저장돼요",
      uploadButton: '영상 파일로 확인하기', // = home.uploadButton (같은 흐름, 같은 이름)
    },
    // [추가·자세히 보기] 근거 목록 아래 접힌 섹션 (명세 §2.3a). 기본은 접힘.
    details: {
      toggle: '자세히 보기',
      toggleOpenA11yHint: '눌러서 신호별 확인 결과를 펼쳐요',
      toggleCloseA11yHint: '눌러서 접어요',
      // 모델 신호(kind=model, ok, weight>0) 점수 줄 = result.percentLabel 재사용 ('AI 가능성 {pct}%')
      modelCaution: '참고용 숫자예요. 아직 정확도를 맞추는 중이라 이 숫자만으로 판단하지는 말아 주세요',
      modelUnavailable: '화면 속 장면은 확인하지 못했어요',
      valueYes: '있음',
      valueNo: '없음',
      /** 신호 id → 사람이 읽을 이름. 모르는 id는 이름 없이 evidence_ko만 보여준다 */
      names: {
        commfor_224: '화면 속 장면 확인',
        hive: '전문 서비스 확인',
        d3: '화면 움직임 확인',
        mock: '시험용 확인',
        yt_creator_ai_disclosure: '유튜브 AI 표시',
        yt_no_ai_label: '유튜브 AI 표시',
        yt_c2pa_ai_label: 'AI 제작 기록',
        yt_c2pa_camera: '카메라 촬영 기록',
        yt_self_report_ai: '제목·설명의 AI 표시',
      } as Record<string, string>,
    },
    disclaimer: '자동으로 확인한 결과라 틀릴 수 있어요',
    shareButton: '가족에게 결과 보내기',
    shareHint: '카카오톡 등으로 보낼 수 있어요',
    // [추가·#12 기능 3] 공유하기로 들어온 경우 같은 버튼의 이름·안내 (받은 곳으로 결과+링크를 다시 보냄)
    reshareButton: '카카오톡 등으로 다시 보내기',
    reshareHint: '확인 결과와 영상 링크를 함께 보내요',
    againButton: '다른 영상 확인하기',
    retryButton: '다시 확인하기',
    shareError: '보내기 화면을 열지 못했어요. 다시 눌러 주세요',
  },
  error: {
    invalid_url: {
      title: '영상 주소가 아닌 것 같아요',
      body: "유튜브에서 '공유 → 링크 복사'를 눌러 다시 붙여넣어 주세요",
      button: '다시 붙여넣기',
    },
    unsupported_platform: {
      title: '아직 이 사이트의 영상은 확인할 수 없어요',
      body: '지금은 유튜브 쇼츠를 확인할 수 있어요',
      button: '다시 붙여넣기',
    },
    video_unavailable: {
      title: '영상을 열 수 없어요',
      body: '삭제되었거나 비공개 영상일 수 있어요',
      button: '다시 붙여넣기',
    },
    file_too_large: {
      title: '영상이 너무 크거나 길어요',
      body: '3분 이내의 짧은 영상을 골라 주세요',
      button: '처음으로',
    },
    // 계약 v1.1 — 업로드한 파일이 없거나 영상으로 열 수 없음. 같은 파일 재시도는 의미 없으므로 '처음으로'
    invalid_file: {
      title: '이 영상 파일은 열 수 없어요',
      body: '휴대폰에 저장된 다른 영상을 골라 다시 확인해 주세요',
      button: '처음으로',
    },
    rate_limited: {
      title: '잠시 후 다시 시도해 주세요',
      body: '지금 확인 요청이 많아요. 1분쯤 뒤에 다시 눌러 주세요',
      button: '다시 해보기',
    },
    detectors_down: {
      title: '지금은 확인이 어려워요',
      body: '잠시 후 다시 시도해 주세요',
      button: '다시 해보기',
    },
    network: {
      title: '인터넷 연결을 확인해 주세요',
      body: '와이파이나 데이터가 켜져 있는지 확인한 뒤 다시 눌러 주세요',
      button: '다시 해보기',
    },
    timeout: {
      title: '지금은 확인이 어려워요',
      body: '시간이 너무 오래 걸렸어요. 잠시 후 다시 시도해 주세요',
      button: '다시 해보기',
    },
    unknown: {
      title: '지금은 확인이 어려워요',
      body: '잠시 후 다시 시도해 주세요',
      button: '다시 해보기',
    },
    homeButton: '처음으로',
  } satisfies Record<ErrorCode, ErrorCopy> & { homeButton: string },
  share: {
    template: '[{appName} 영상 확인 결과]\n{headline} ({percentLabel})\n{sub}\n{evidenceBlock}\n영상 주소: {url}\n\n{footer}',
    evidenceLine: '- {evidence}',
    // [변경·#12 기능 3] 'jjajja로 확인했어요' 꼬리 (사용자 결정). 틀릴 수 있다는 안내는 유지
    footer: '※ {appName}로 확인했어요. 자동으로 확인한 결과라 틀릴 수 있어요',
    // [추가·#12 기능 3] 받는 사람에게 하는 한 줄 (화면의 sub는 보내는 사람에게 하는 말이라 메시지에는 맞지 않음).
    // unknown은 결과를 보내지 않는다 (버튼 숨김) — 확인 못 한 영상을 '확인했다'며 퍼뜨리지 않게
    verdictLine: {
      likely_ai: '내용을 그대로 믿기 전에 한 번 더 확인해 보세요',
      uncertain: '출처가 확실한 곳에서 같은 내용을 찾아보세요',
      likely_real: '그래도 내용이 사실인지는 따로 확인이 필요해요',
    } satisfies Record<Exclude<Verdict, 'unknown'>, string>,
    dialogTitle: '결과 보내기',
    // [추가] 영상 파일로 확인한 경우 '영상 주소: {url}' 줄 대신 쓰는 줄
    uploadedVideoLine: '영상: 휴대폰에 저장된 영상을 직접 확인했어요',
  },
} as const;

/** 에러 주 버튼 동작 — 명세 §2.4/§5.5 */
export type ErrorButtonAction = 'home' | 'retry';
export function errorButtonAction(label: string): ErrorButtonAction {
  return label === copy.error.invalid_url.button || label === copy.error.homeButton ? 'home' : 'retry';
}

/** 서버/앱 에러 code → 문구. 모르는 code는 error.unknown 폴백 (명세 §2.4) */
export function errorCopyFor(code: string): ErrorCopy & { code: ErrorCode } {
  const table = copy.error as unknown as Record<string, ErrorCopy | string>;
  const hit = code !== 'homeButton' ? table[code] : undefined;
  if (hit && typeof hit === 'object') return { ...hit, code: code as ErrorCode };
  return { ...copy.error.unknown, code: 'unknown' };
}

/** `{name}` 자리표시자 단순 치환 (명세 §5.0) */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
