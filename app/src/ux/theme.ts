// source: design/tokens.json (디자인 시스템 v2.0 잉크 & 크림 정제·에디토리얼, #21) — 문서: .claude/skills/senior-ux-korean/references/design-system.md
// 값은 tokens.json에서 그대로 가져온다. 이 파일에 색·크기 숫자를 직접 적지 않는다.
// tokens.json은 design/tokens.json의 복사본(scripts/sync-tokens.js). 일치 여부는 __tests__/theme.test.ts가 확인한다.
// 라이트 모드만 지원한다 (디자인 시스템 A1).
import { Platform, type TextStyle } from 'react-native';
import type { Verdict } from '../api/contract';
import tokens from './tokens.json';

export { tokens };

/** 기본 색 (tokens.color) — paper, surface, sunken, line(장식 1px), lineUi(UI 경계 1px), lineStrong(개발 카드만), ink, ... */
export const color = tokens.color;

/** 판정 4종 (tokens.verdict): main(판정 윗선·도장·헤드라인·배지 아이콘), tint(v2 예약, 쓰지 않음), icon.mci(outline 아이콘) */
export const verdict = tokens.verdict as Record<Verdict, (typeof tokens.verdict)['likely_ai']>;

/** MaterialCommunityIcons outline 이름 (tokens.verdict[v].icon.mci) */
export type VerdictIconName = 'alert-outline' | 'help-circle-outline' | 'check-circle-outline' | 'minus-circle-outline';
export const verdictIcon = Object.fromEntries(
  (Object.keys(tokens.verdict) as Verdict[]).map((v) => [v, tokens.verdict[v].icon.mci]),
) as Record<Verdict, VerdictIconName>;

/** 개발자 모드 색 (tokens.dev) */
export const dev = tokens.dev;

export const radius = tokens.radius;
export const border = tokens.border;
export const size = tokens.size;
export const motion = tokens.motion;

/** 간격: 4·8·12·16·20·24·32·48·64 단계(space[1]~space[9]) + 섹션 40·판정 블록 위아래 24 + 앱 화면 좌우 여백 24 */
export const space = {
  ...tokens.space,
  screenX: tokens.space.screenX.app,
};

/** 시스템 글자 크기 확대 상한 (§3.2) */
export const MAX_FONT_SCALE = tokens.font.maxFontScale;

// ---------------------------------------------------------------------------
// 글꼴 — tokens.font.scale의 family+weight를 실제 fontFamily로 바꾼다 (§8.1).
// 커스텀 폰트는 fontWeight 대신 family로 굵기를 고른다(Android 가짜 볼드 방지).
// 폰트가 아직 안 올라왔거나 실패하면 components/ui의 T가 시스템 글꼴 + fontWeight로 바꿔 그린다.
// ---------------------------------------------------------------------------

type Weight = '400' | '600' | '700';
type Family = 'sans' | 'serif' | 'mono';

const SANS = tokens.font.family.sans.app;
const SERIF = tokens.font.family.serif.app;
const MONO =
  Platform.select({
    ios: tokens.font.family.mono.app.ios,
    android: tokens.font.family.mono.app.android,
    default: tokens.font.family.mono.web,
  }) ?? 'monospace';

/** 번들한 커스텀 폰트 이름 → 폴백 굵기 (T가 로드 전/실패 시 시스템 글꼴로 바꿀 때 쓴다) */
export const CUSTOM_FONT_WEIGHT: Record<string, Weight> = {
  [SANS.regular]: '400',
  [SANS.semibold]: '600',
  [SANS.bold]: '700',
  [SERIF.semibold]: '600', // 폴백: 고딕 600 (§3.1 — 명조 폴백도 v2 굵기를 따른다)
  [SERIF.bold]: '700', // 판정 헤드라인만
};

function familyFor(family: Family, weight: Weight): string {
  // 명조: 600 → SemiBold(큰 제목), 700 → Bold(판정 헤드라인 하나뿐, §0.2 V2)
  if (family === 'serif') return weight === '700' ? SERIF.bold : SERIF.semibold;
  if (family === 'mono') return MONO;
  return weight === '700' ? SANS.bold : weight === '600' ? SANS.semibold : SANS.regular;
}

interface ScaleToken {
  family: string;
  size: number;
  lineHeight: number;
  weight: string;
  letterSpacing?: number;
  numeric?: string;
}

function textStyle(t: ScaleToken): TextStyle {
  const family = t.family as Family;
  const s: TextStyle = { fontFamily: familyFor(family, t.weight as Weight), fontSize: t.size, lineHeight: t.lineHeight };
  if (family === 'mono') s.fontWeight = t.weight as Weight; // 시스템 고정폭 글꼴은 fontWeight로 굵기를 고른다
  if (t.letterSpacing !== undefined) s.letterSpacing = t.letterSpacing;
  if (t.numeric === 'tabular-nums') s.fontVariant = ['tabular-nums'];
  return s;
}

type ScaleKey = keyof typeof tokens.font.scale;
type DevKey = keyof typeof tokens.font.dev;

const scale = tokens.font.scale as Record<ScaleKey, ScaleToken>;
const devScale = tokens.font.dev as Record<DevKey, ScaleToken>;

/**
 * 실사용자 화면 글자 단계 (tokens.font.scale):
 *   display(명조 600) / headline(명조 700 — **판정 헤드라인 전용**) / title, subhead, button, body, bodyStrong, figure, caption, eyebrow
 * + 파생 2개 (토큰 값 그대로, family만 바꾼다):
 *   titleSerif — headline 크기(26/36)를 명조 600으로. 에러·안내 제목 (§3.2 "headline + family semibold")
 *   badge      — caption 16/24를 600으로. 영상 위 유튜브 배지 라벨 (§5.5)
 */
const baseFont = Object.fromEntries(
  (Object.keys(scale) as ScaleKey[]).map((k) => [k, textStyle(scale[k])]),
) as Record<ScaleKey, TextStyle>;
export const font = {
  ...baseFont,
  titleSerif: { ...baseFont.headline, fontFamily: SERIF.semibold } as TextStyle,
  badge: { ...baseFont.caption, fontFamily: SANS.semibold } as TextStyle,
};

/** 개발자 모드 글자 단계: mono, monoStrong, label, title, band (18pt 규칙 예외, 최소 13) */
export const devFont = Object.fromEntries(
  (Object.keys(devScale) as DevKey[]).map((k) => [k, textStyle(devScale[k])]),
) as Record<DevKey, TextStyle>;

/** expo-font로 불러올 파일 (키 = tokens의 앱 글꼴 이름) */
export const FONT_ASSETS = {
  [SANS.regular]: require('../../assets/fonts/Pretendard-Regular.otf'),
  [SANS.semibold]: require('../../assets/fonts/Pretendard-SemiBold.otf'),
  [SANS.bold]: require('../../assets/fonts/Pretendard-Bold.otf'),
  [SERIF.semibold]: require('../../assets/fonts/NotoSerifKR-SemiBold.otf'),
  [SERIF.bold]: require('../../assets/fonts/NotoSerifKR-Bold.otf'),
} as Record<string, number>;

/** 버튼 수치 (§5.1, §4.4) — 보이는 높이와 터치 영역(hitSlop)을 분리한다 */
export const button = {
  primary: { minHeight: size.buttonMinHeight, paddingX: size.buttonPaddingX.primary, maxWidth: size.buttonMaxWidth, hitSlop: size.hitSlop.primary },
  secondary: { minHeight: size.buttonSecondaryHeight, paddingX: size.buttonPaddingX.secondary, hitSlop: size.hitSlop.secondary },
  text: { minHeight: size.textButtonHeight, hitSlop: size.hitSlop.text },
  icon: { box: 40, icon: 22, hitSlop: size.hitSlop.icon },
} as const;
