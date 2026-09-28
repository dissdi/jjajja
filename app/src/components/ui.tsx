import { Pressable, StyleSheet, Text, type TextProps } from 'react-native';
import { border, color, font, MAX_FONT_SCALE, radius, size } from '../ux/theme';

/** 모든 글자는 시스템 글자 크기를 따르되 1.6배 상한 (명세 §6.2) */
export function T(props: TextProps) {
  return <Text maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

/** 폭 가득, minHeight 60 (명세 §6.3) */
export function Button({ label, onPress, variant = 'primary', disabled }: ButtonProps) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        primary
          ? { backgroundColor: pressed ? color.primaryPressed : color.primary }
          : { backgroundColor: pressed ? color.surface : color.background, borderWidth: border.outline, borderColor: color.border },
        disabled && { opacity: 0.5 },
      ]}
    >
      <T style={[font.button, { color: primary ? color.onPrimary : color.textPrimary, textAlign: 'center' }]}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: size.buttonMinHeight,
    borderRadius: radius.button,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
