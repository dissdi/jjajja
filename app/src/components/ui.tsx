// 공통 부품 — 디자인 시스템 v2 §5 (잉크 & 크림 정제·에디토리얼). 색·크기는 ux/theme(tokens.json)만 쓴다.
// Do/Don't 표(§0)는 __tests__/designRules.test.tsx가 지킨다.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createContext, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import type { Verdict } from '../api/contract';
import { CONTRACT_VERSION } from '../api/contract';
import { DEBUG_MODE } from '../debug';
import { copy } from '../ux/copy';
import {
  border,
  button,
  color,
  CUSTOM_FONT_WEIGHT,
  dev,
  devFont,
  font,
  MAX_FONT_SCALE,
  motion,
  radius,
  size,
  space,
  verdict as verdictTokens,
  verdictIcon,
} from '../ux/theme';

// ---------------------------------------------------------------------------
// 글꼴 준비 상태 — 번들 폰트가 올라오기 전(또는 실패)에는 시스템 글꼴 + fontWeight로 그린다.
// (iOS는 등록 안 된 fontFamily를 쓰면 개발 모드에서 에러를 낸다)
// ---------------------------------------------------------------------------

export const FontsReadyContext = createContext(false);

export function resolveFont<S extends TextStyle>(style: StyleProp<S>, ready: boolean): StyleProp<S> {
  if (ready) return style;
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  if (!flat?.fontFamily || !(flat.fontFamily in CUSTOM_FONT_WEIGHT)) return style;
  const { fontFamily, ...rest } = flat;
  return { ...rest, fontWeight: CUSTOM_FONT_WEIGHT[fontFamily] } as S;
}

/** 모든 글자: 시스템 글자 크기를 따르되 1.6배 상한 (§3.2). 폰트 로드 전에는 시스템 글꼴 */
export function T({ style, ...props }: TextProps) {
  const ready = useContext(FontsReadyContext);
  return <Text maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} style={resolveFont(style, ready)} />;
}

/** TextInput도 같은 규칙 */
export function Input({ style, ...props }: TextInputProps) {
  const ready = useContext(FontsReadyContext);
  return (
    <TextInput
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      placeholderTextColor={color.inkTertiary}
      {...props}
      style={resolveFont(style, ready)}
    />
  );
}

// ---------------------------------------------------------------------------
// 버튼 §5.1 (v2) — 보이는 크기는 줄이고 터치 영역은 hitSlop으로 지킨다 (§0.1, §4.4)
//   주(primary)   : 잉크 면, 보이는 높이 48, 내용 폭(최대 400, 가운데), 17/600, 모서리 8. 한 화면에 하나
//   선(secondary) : 1px lineUi 테두리, 높이 44, 글자 폭 + 좌우 20, hitSlop 4 → 터치 52
//   텍스트(text)  : 남색 밑줄 글자, 높이 44, hitSlop 4 → 터치 52. 눌림은 글자색 ink
// 고정 height 금지(minHeight만) — 1.6배 확대에서 두 줄이 되면 버튼도 같이 커진다.
// ---------------------------------------------------------------------------

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
type Align = 'left' | 'center' | 'right';
const alignSelfFor = (a: Align) => (a === 'center' ? 'center' : a === 'right' ? 'flex-end' : 'flex-start');

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'text';
  disabled?: boolean;
  /** 글자 왼쪽 아이콘 20 (글자와 같은 색, 간격 8) */
  icon?: IconName;
  /** 선·텍스트 버튼 정렬. 기본 가운데(주 버튼 아래), 목록·설정 화면에서는 왼쪽 (§5.1) */
  align?: Align;
  /** 읽어주기 이름 — 보이는 글자와 다를 때만 (예: [뒤로] → '이전 화면으로') */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  icon,
  align = 'center',
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ButtonProps) {
  if (variant === 'text') {
    return <TextButton label={label} onPress={onPress} accessibilityHint={accessibilityHint} testID={testID} align={align} />;
  }
  const primary = variant === 'primary';
  const fg = disabled ? color.disabledFg : primary ? color.onInk : color.ink;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={primary ? button.primary.hitSlop : button.secondary.hitSlop}
      style={({ pressed }) => [
        styles.buttonBase,
        primary
          ? [styles.primary, { backgroundColor: disabled ? color.disabledBg : pressed ? color.inkPressed : color.ink }]
          : [
              styles.secondary,
              {
                alignSelf: alignSelfFor(align),
                backgroundColor: pressed ? color.sunken : 'transparent',
                borderColor: disabled ? color.disabledFg : color.lineUi,
              },
            ],
      ]}
    >
      {icon && <MaterialCommunityIcons name={icon} size={size.buttonIcon} color={fg} />}
      <T style={[font.button, { color: fg, textAlign: 'center', flexShrink: 1 }]}>{label}</T>
    </Pressable>
  );
}

export function TextButton({
  label,
  onPress,
  accessibilityHint,
  testID,
  icon,
  align = 'center',
}: {
  label: string;
  onPress: () => void;
  accessibilityHint?: string;
  testID?: string;
  /** 글자 오른쪽 아이콘 20 (chevron 등) */
  icon?: IconName;
  align?: Align;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      hitSlop={button.text.hitSlop}
      style={[styles.textButton, { alignSelf: alignSelfFor(align) }]}
    >
      {({ pressed }) => {
        const c = pressed ? color.ink : color.accent; // 눌림: 글자색만 바꾼다 (§5.1)
        return (
          <>
            <T style={[font.button, { color: c, textDecorationLine: 'underline', textDecorationColor: c, flexShrink: 1 }]}>{label}</T>
            {icon && <MaterialCommunityIcons name={icon} size={size.buttonIcon} color={c} />}
          </>
        );
      }}
    </Pressable>
  );
}

/** 아이콘 버튼 (지우기 ✕, 비밀번호 보기) — 아이콘 22, 상자 40, hitSlop 8 → 터치 56 (§4.4) */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  tint = color.inkTertiary,
  testID,
}: {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  tint?: string;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={button.icon.hitSlop}
      style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: color.sunken }]}
    >
      <MaterialCommunityIcons name={icon} size={button.icon.icon} color={tint} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// 화면 머리 — 높이 52, eyebrow "JJAJJA" + (오른쪽 텍스트 버튼들) + 아래 1px line (§6 공통)
// ---------------------------------------------------------------------------

export function TopBar({ right }: { right?: ReactNode }) {
  return (
    <View style={styles.topBar}>
      <T style={[font.eyebrow, { color: color.inkSecondary, textTransform: 'uppercase', flex: 1 }]} accessibilityRole="header">
        {copy.app.name}
      </T>
      {right}
    </View>
  );
}

/** 제목 아래 짧은 잉크 괘선 24×1 (§3.3) — 홈·확인 중·에러 제목 아래에만 */
export function Rule({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.rule, style]} />;
}

/** 장식 헤어라인 1px line (섹션·목록 구분) */
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: border.hair, backgroundColor: color.line }, style]} />;
}

// ---------------------------------------------------------------------------
// 판정 도장 §5.4 — 40, 테두리 1.5 main. likely_ai만 각진(radius 4), 나머지는 원. 스크린리더에서 숨긴다
// ---------------------------------------------------------------------------

export function VerdictMark({ verdict }: { verdict: Verdict }) {
  const c = verdictTokens[verdict].main;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`verdict-mark-${verdict}`}
      style={{
        width: size.verdictMark,
        height: size.verdictMark,
        borderWidth: border.mark,
        borderColor: c,
        borderRadius: verdict === 'likely_ai' ? radius.sm : radius.round,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <MaterialCommunityIcons name={verdictIcon[verdict]} size={size.verdictIcon} color={c} />
    </View>
  );
}

/** 목록 행의 판정 아이콘 20 (도장 테두리 없음, §6.7) */
export function VerdictGlyph({ verdict }: { verdict: Verdict }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={`verdict-glyph-${verdict}`}>
      <MaterialCommunityIcons name={verdictIcon[verdict]} size={size.buttonIcon} color={verdictTokens[verdict].main} />
    </View>
  );
}

/**
 * 판정 블록 §5.4 (v2): 면·왼쪽 띠·외곽선 없음. 종이 위에
 *   위 1px 판정색 선 → (24) 도장 40 → (16) 헤드라인 명조 26/36 700 main → (8) 퍼센트 figure inkSecondary → (12) 보조 문장 body ink → (24)
 */
export function VerdictBlock({
  verdict,
  headline,
  percent,
  sub,
  testID,
}: {
  verdict: Verdict;
  headline: string;
  percent: string | null;
  sub: string;
  testID?: string;
}) {
  const v = verdictTokens[verdict];
  return (
    <View
      testID={testID}
      style={[styles.verdictBlock, { borderTopColor: v.main }]}
      accessible
      accessibilityLabel={[headline, percent, sub].filter(Boolean).join('. ')}
    >
      <VerdictMark verdict={verdict} />
      <T style={[font.headline, { color: v.main, marginTop: space[4] }]}>{headline}</T>
      {percent !== null && <T style={[font.figure, { color: color.inkSecondary, marginTop: space[2] }]}>{percent}</T>}
      <T style={[font.body, { color: color.ink, marginTop: space[3] }]}>{sub}</T>
    </View>
  );
}

/**
 * 안내·에러 제목 묶음 (§6.4): 도장 40(unknown 회색, 판정 윗선 없음) → (20) 명조 600 26/36 ink → (12) 괘선 → (12) 본문 inkSecondary.
 * 에러는 판정이 아니므로 700·판정색을 쓰지 않는다. 빨강 금지.
 */
export function NoticeHead({ title, body, mark = true }: { title: string; body: string; mark?: boolean }) {
  return (
    <View accessible accessibilityLabel={`${title}. ${body}`}>
      {mark && <VerdictMark verdict="unknown" />}
      <T style={[font.titleSerif, { color: color.ink, marginTop: mark ? space[5] : 0 }]}>{title}</T>
      <Rule style={{ marginTop: space[3] }} />
      <T style={[font.body, { color: color.inkSecondary, marginTop: space[3] }]}>{body}</T>
    </View>
  );
}

/** 화면 제목 묶음 (§4.3): display 명조 600 → (12) 괘선 → (12) 설명. rule=false면 괘선 없이 */
export function ScreenTitle({ title, subtitle, rule = true }: { title: string; subtitle?: string; rule?: boolean }) {
  return (
    <View>
      <T style={[font.display, { color: color.ink }]} accessibilityRole="header">
        {title}
      </T>
      {rule && <Rule style={{ marginTop: space[3] }} />}
      {subtitle !== undefined && <T style={[font.body, { color: color.inkSecondary, marginTop: space[3] }]}>{subtitle}</T>}
    </View>
  );
}

// ---------------------------------------------------------------------------
// 안내 줄 §5.3 — 면·테두리·선 없이 information-outline 18 + caption inkSecondary, 간격 8
// ---------------------------------------------------------------------------

export function Note({ text, style, icon = 'information-outline' }: { text: string; style?: StyleProp<ViewStyle>; icon?: IconName }) {
  return (
    <View style={[styles.note, style]}>
      <MaterialCommunityIcons name={icon} size={NOTE_ICON} color={color.inkSecondary} style={{ marginTop: 3 }} />
      <T style={[font.caption, { color: color.inkSecondary, flex: 1 }]}>{text}</T>
    </View>
  );
}

/** 입력 에러 줄 §5.2 — 위 8, alert-outline 18 + body likely_ai.main */
export function InlineError({ text, testID }: { text: string; testID?: string }) {
  return (
    <View style={styles.inlineError} accessibilityLiveRegion="polite" accessibilityRole="alert" testID={testID}>
      <MaterialCommunityIcons name="alert-outline" size={NOTE_ICON} color={verdictTokens.likely_ai.main} style={{ marginTop: 5 }} />
      <T style={[font.body, { color: verdictTokens.likely_ai.main, flex: 1 }]}>{text}</T>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 입력칸 §5.2 (v2) — surface 면, 1px lineUi, radius 6, 최소 높이 56, 좌우 16.
// 포커스 1.5 ink, 에러 1.5 likely_ai.main. 테두리가 굵어진 만큼 안쪽 패딩을 줄여 글자가 밀리지 않게 한다.
// ---------------------------------------------------------------------------

interface FieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string | null;
  hint?: string;
  right?: ReactNode;
}

export function TextField({ label, error, hint, right, onFocus, onBlur, ...input }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? verdictTokens.likely_ai.main : focused ? color.ink : color.lineUi;
  const borderWidth = error || focused ? border.emphasis : border.hair;
  const inset = borderWidth - border.hair;
  return (
    <View>
      {label && <T style={[font.subhead, { color: color.ink, marginBottom: space[2] }]}>{label}</T>}
      <View
        testID={input.testID ? `${input.testID}-box` : undefined}
        style={[
          styles.inputWrap,
          { borderColor, borderWidth, paddingLeft: space[4] - inset, paddingRight: (right ? space[1] : space[4]) - inset },
        ]}
      >
        <Input
          accessibilityLabel={label}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[font.body, styles.input]}
        />
        {right}
      </View>
      {hint && !error && <T style={[font.caption, { color: color.inkTertiary, marginTop: space[2] }]}>{hint}</T>}
      {error && <InlineError text={error} />}
    </View>
  );
}

// ---------------------------------------------------------------------------
// 잉크 번짐 §5.7 — 앱의 유일한 반복 애니메이션. 점은 가만히, 링만 퍼진다. reduce motion이면 정지된 점
// ---------------------------------------------------------------------------

function bezierFrom(css: string) {
  const n = css.match(/-?[\d.]+/g)?.map(Number) ?? [];
  return n.length === 4 ? Easing.bezier(n[0], n[1], n[2], n[3]) : Easing.out(Easing.cubic);
}

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => alive && setReduce(!!v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => setReduce(!!v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

export function InkBloom({ dot = motion.inkBloom.dot }: { dot?: number }) {
  const reduce = useReduceMotion();
  const t = useRef(new Animated.Value(0)).current;
  const m = motion.inkBloom;
  useEffect(() => {
    if (reduce) return;
    const anim = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: m.durationMs,
        easing: bezierFrom(m.easing),
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [reduce, t, m.durationMs, m.easing]);
  const box = dot * 2;
  return (
    <View
      testID="ink-bloom"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}
    >
      {!reduce && (
        <Animated.View
          style={{
            position: 'absolute',
            width: dot,
            height: dot,
            borderRadius: radius.round,
            borderWidth: motion.inkBloom.ringBorder,
            borderColor: color.ink,
            opacity: t.interpolate({ inputRange: [0, 1], outputRange: [m.opacityFrom, m.opacityTo] }),
            transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [m.scaleFrom, m.scaleTo] }) }],
          }}
        />
      )}
      <View style={{ width: dot, height: dot, borderRadius: radius.round, backgroundColor: color.ink }} />
    </View>
  );
}

/** 화면 가운데 잉크 번짐 + 한 줄 (기록·계정 불러오는 중) */
export function LoadingBlock({ text }: { text: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: space[8] }} accessible accessibilityLiveRegion="polite" accessibilityLabel={text}>
      <InkBloom />
      <T style={[font.body, { color: color.inkSecondary, marginTop: space[4], textAlign: 'center' }]}>{text}</T>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 개발자 모드 §7 — DEV 띠(모든 화면 맨 위), DEV 칩, 상태 칩
// ---------------------------------------------------------------------------

export function devBandText(apiBase: string): string {
  let host = apiBase;
  try {
    host = new URL(apiBase).host || apiBase;
  } catch {
    // 그대로
  }
  return `DEV · api ${host} · v${CONTRACT_VERSION}`;
}

export function DevBand({ apiBase, enabled = DEBUG_MODE }: { apiBase: string; enabled?: boolean }) {
  if (!enabled) return null;
  return (
    <View testID="dev-band" style={styles.devBand}>
      <T style={[devFont.band, { color: dev.bandText }]} numberOfLines={1} selectable>
        {devBandText(apiBase)}
      </T>
    </View>
  );
}

export function DevChip({ label = 'DEV' }: { label?: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: dev.band }]}>
      <T style={[devFont.monoStrong, { color: color.onInk, fontSize: 12, lineHeight: 16 }]}>{label}</T>
    </View>
  );
}

export function StatusChip({ status }: { status: 'OK' | 'FAIL' | 'SKIP' }) {
  const fail = status === 'FAIL';
  const c = status === 'OK' ? dev.ok : status === 'SKIP' ? dev.warn : dev.fail;
  return (
    <View style={[styles.chip, fail ? { backgroundColor: dev.fail } : { borderWidth: 1, borderColor: c }]}>
      <T style={[devFont.monoStrong, { color: fail ? color.onInk : c, fontSize: 12, lineHeight: 16 }]}>{status}</T>
    </View>
  );
}

/** 안내 줄·입력 에러 아이콘 18 (§5.2, §5.3 — tokens에 없는 문서 값) */
const NOTE_ICON = 18;
/** 버튼 글자 행간 (tokens.font.scale.button.lineHeight = 24) — 보이는 높이 = 행간 + 위아래 패딩 */
const BUTTON_LINE = 24;

const styles = StyleSheet.create({
  buttonBase: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    borderRadius: radius.button,
  },
  // 주: 내용 폭(부모 폭 - 좌우 24×2), 최대 400, 가운데. 글자 24 + 위아래 12 = 48
  primary: {
    minHeight: button.primary.minHeight,
    width: '100%',
    maxWidth: button.primary.maxWidth,
    alignSelf: 'center',
    paddingHorizontal: button.primary.paddingX,
    paddingVertical: (button.primary.minHeight - BUTTON_LINE) / 2,
  },
  // 선: 글자 폭. 글자 24 + 위아래 (10 - 테두리 1) + 테두리 1×2 = 44
  secondary: {
    minHeight: button.secondary.minHeight,
    paddingHorizontal: button.secondary.paddingX,
    paddingVertical: (button.secondary.minHeight - BUTTON_LINE) / 2 - border.hair,
    borderWidth: border.hair,
  },
  textButton: {
    minHeight: button.text.minHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[1],
    paddingVertical: (button.text.minHeight - BUTTON_LINE) / 2,
  },
  iconButton: {
    width: button.icon.box,
    height: button.icon.box,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: size.topBar,
    borderBottomWidth: border.hair,
    borderBottomColor: color.line,
    gap: space[5],
  },
  rule: { width: size.rule.width, height: size.rule.height, backgroundColor: color.ink },
  verdictBlock: {
    borderTopWidth: border.verdictLine,
    paddingVertical: space.blockY,
  },
  note: { flexDirection: 'row', gap: space[2] },
  inlineError: { flexDirection: 'row', gap: space[2], marginTop: space[2] },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: size.inputMinHeight,
    backgroundColor: color.surface,
    borderRadius: radius.md,
  },
  // minWidth 0: 웹에서 TextInput이 고유 폭 때문에 줄어들지 않아 오른쪽 버튼(비밀번호 보기)을 밀어내는 것 방지
  input: { flex: 1, minWidth: 0, color: color.ink, paddingVertical: space[3] },
  devBand: {
    height: size.devBand,
    backgroundColor: dev.band,
    justifyContent: 'center',
    paddingHorizontal: space[3],
  },
  chip: { borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
});
