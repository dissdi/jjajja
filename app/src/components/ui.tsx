// 공통 부품 — 디자인 시스템 §5 (잉크 & 크림). 색·크기는 ux/theme(tokens.json)만 쓴다.
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
// 버튼 §5.1 — 주(잉크 면) / 보조(2px 잉크 테두리) / 텍스트(남색 밑줄). 터치 최소 48, 주·보조는 60
// ---------------------------------------------------------------------------

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'text';
  disabled?: boolean;
  /** 글자 왼쪽 아이콘 22 (글자와 같은 색) */
  icon?: IconName;
  accessibilityHint?: string;
  testID?: string;
}

export function Button({ label, onPress, variant = 'primary', disabled, icon, accessibilityHint, testID }: ButtonProps) {
  if (variant === 'text') return <TextButton label={label} onPress={onPress} accessibilityHint={accessibilityHint} testID={testID} />;
  const primary = variant === 'primary';
  const fg = disabled ? color.disabledFg : primary ? color.onInk : color.ink;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: disabled ? color.disabledBg : pressed ? color.inkPressed : color.ink }
          : {
              backgroundColor: pressed ? color.sunken : 'transparent',
              borderWidth: border.strong,
              borderColor: disabled ? color.disabledFg : color.ink,
            },
      ]}
    >
      {icon && <MaterialCommunityIcons name={icon} size={size.badgeIcon} color={fg} style={{ marginRight: space[2] }} />}
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
  align = 'left',
}: {
  label: string;
  onPress: () => void;
  accessibilityHint?: string;
  testID?: string;
  icon?: IconName;
  align?: 'left' | 'center' | 'right';
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      hitSlop={4}
      style={[
        styles.textButton,
        { justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start' },
      ]}
    >
      {({ pressed }) => (
        <>
          <T
            style={[
              font.bodyStrong,
              {
                color: color.accent,
                textDecorationLine: 'underline',
                textDecorationColor: color.accent,
                // 눌림: 밑줄을 굵게 대신 글자 아래 2px 선 (RN은 밑줄 두께를 못 바꾼다)
                borderBottomWidth: pressed ? border.strong : 0,
                borderBottomColor: color.accent,
              },
            ]}
          >
            {label}
          </T>
          {icon && <MaterialCommunityIcons name={icon} size={size.badgeIcon} color={color.accent} />}
        </>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// 화면 머리 — eyebrow "JJAJJA" + (오른쪽 텍스트 버튼들) + 아래 1px line (§6 공통)
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

/** 헤드라인 아래 짧은 잉크 괘선 32×2 (§3.3) */
export function Rule({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.rule, style]} />;
}

/** 섹션 사이 장식 구분선 1px line */
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: border.hair, backgroundColor: color.line }, style]} />;
}

// ---------------------------------------------------------------------------
// 판정 마크(도장) §5.4 — likely_ai만 각진 정사각, 나머지는 원. 스크린리더에서 숨긴다
// ---------------------------------------------------------------------------

export function VerdictMark({ verdict, small = false }: { verdict: Verdict; small?: boolean }) {
  const box = small ? 36 : size.verdictMark;
  const icon = small ? 22 : size.verdictIcon;
  const c = verdictTokens[verdict].main;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`verdict-mark-${verdict}`}
      style={{
        width: box,
        height: box,
        borderWidth: border.strong,
        borderColor: c,
        borderRadius: verdict === 'likely_ai' ? radius.sm : radius.round,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <MaterialCommunityIcons name={verdictIcon[verdict]} size={icon} color={c} />
    </View>
  );
}

/**
 * 판정 블록 §5.4: 왼쪽 띠 6 main, 면 tint, radius 0.
 * 순서: 마크 → 헤드라인(명조 26, main) → 괘선 → 퍼센트(figure, inkSecondary, 없으면 생략) → 보조 문장(subhead, ink)
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
      style={[styles.verdictBlock, { backgroundColor: v.tint, borderLeftColor: v.main }]}
      accessible
      accessibilityLabel={[headline, percent, sub].filter(Boolean).join('. ')}
    >
      <VerdictMark verdict={verdict} />
      <T style={[font.headline, { color: v.main, marginTop: space[3] }]}>{headline}</T>
      <Rule style={{ marginTop: space[2] }} />
      {percent !== null && <T style={[font.figure, { color: color.inkSecondary, marginTop: space[2] }]}>{percent}</T>}
      <T style={[font.subhead, { color: color.ink, marginTop: space[2] }]}>{sub}</T>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 안내 줄 §5.3 — information-outline 20 + caption inkSecondary, 위아래 1px line
// ---------------------------------------------------------------------------

export function Note({ text, style, icon = 'information-outline' }: { text: string; style?: StyleProp<ViewStyle>; icon?: IconName }) {
  return (
    <View style={[styles.note, style]}>
      <MaterialCommunityIcons name={icon} size={20} color={color.inkSecondary} style={{ marginTop: 2 }} />
      <T style={[font.caption, { color: color.inkSecondary, flex: 1 }]}>{text}</T>
    </View>
  );
}

/** 입력 에러 줄 §5.2 — alert-outline 20 + body likely_ai.main */
export function InlineError({ text, testID }: { text: string; testID?: string }) {
  return (
    <View style={styles.inlineError} accessibilityLiveRegion="polite" accessibilityRole="alert" testID={testID}>
      <MaterialCommunityIcons name="alert-outline" size={20} color={verdictTokens.likely_ai.main} style={{ marginTop: 4 }} />
      <T style={[font.body, { color: verdictTokens.likely_ai.main, flex: 1 }]}>{text}</T>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 입력칸 §5.2 — surface 면, 1.5 lineStrong, radius 4, 높이 64. 포커스 2 ink, 에러 2 likely_ai.main
// ---------------------------------------------------------------------------

interface FieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string | null;
  hint?: string;
  right?: ReactNode;
}

export function TextField({ label, error, hint, right, onFocus, onBlur, ...input }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? verdictTokens.likely_ai.main : focused ? color.ink : color.lineStrong;
  const borderWidth = error || focused ? border.strong : border.ink;
  return (
    <View>
      {label && <T style={[font.bodyStrong, { color: color.ink, marginBottom: space[2] }]}>{label}</T>}
      <View style={[styles.inputWrap, { borderColor, borderWidth }]}>
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
      {hint && !error && <T style={[font.caption, { color: color.inkTertiary, marginTop: 6 }]}>{hint}</T>}
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

export function InkBloom({ dot = 20 }: { dot?: number }) {
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
            borderWidth: border.strong,
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

const styles = StyleSheet.create({
  button: {
    minHeight: size.buttonMinHeight,
    borderRadius: radius.md,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  textButton: {
    minHeight: size.touchMin,
    minWidth: size.touchMin,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: size.touchMin + space[2],
    borderBottomWidth: border.hair,
    borderBottomColor: color.line,
    gap: space[4],
  },
  rule: { width: 32, height: border.rule, backgroundColor: color.ink },
  verdictBlock: {
    borderRadius: radius.none,
    borderLeftWidth: border.verdictStripe,
    padding: space[5],
  },
  note: {
    flexDirection: 'row',
    gap: space[2],
    paddingVertical: space[3],
    borderTopWidth: border.hair,
    borderBottomWidth: border.hair,
    borderColor: color.line,
  },
  inlineError: { flexDirection: 'row', gap: 6, marginTop: space[2] },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: size.inputMinHeight,
    backgroundColor: color.surface,
    borderRadius: radius.sm,
    paddingLeft: space[4],
  },
  // minWidth 0: 웹에서 TextInput이 고유 폭 때문에 줄어들지 않아 오른쪽 버튼(비밀번호 보기)을 밀어내는 것 방지
  input: { flex: 1, minWidth: 0, color: color.ink, paddingVertical: space[3], paddingRight: space[2] },
  devBand: {
    height: size.devBand,
    backgroundColor: dev.band,
    justifyContent: 'center',
    paddingHorizontal: space[3],
  },
  chip: { borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
});
