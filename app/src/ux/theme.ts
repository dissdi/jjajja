// source: _workspace/02_ux_spec.md §6 (디자인 토큰). 라이트 모드 고정 (A2).
import type { Verdict } from '../api/contract';

export const color = {
  background: '#FFFFFF',
  surface: '#F5F6F8',
  textPrimary: '#1A1A1A',
  textSecondary: '#4A4F57',
  border: '#8A9099',
  primary: '#1D4ED8',
  primaryPressed: '#1E3A8A',
  onPrimary: '#FFFFFF',
  danger: '#B42318',
  neutral: '#6B7280',
} as const;

export const verdictColor: Record<Verdict, { main: string; bg: string; text: string }> = {
  likely_ai: { main: '#D92D20', bg: '#FEF3F2', text: '#912018' },
  uncertain: { main: '#DC9B00', bg: '#FFF8E6', text: '#7A4D00' },
  likely_real: { main: '#16833A', bg: '#EEF8F0', text: '#0E5A27' },
  unknown: { main: '#6B7280', bg: '#F3F4F6', text: '#374151' },
};

/** 명세 §3.1 — MaterialCommunityIcons 이름 */
export const verdictIcon: Record<Verdict, 'alert' | 'help-circle' | 'check-circle' | 'minus-circle'> = {
  likely_ai: 'alert',
  uncertain: 'help-circle',
  likely_real: 'check-circle',
  unknown: 'minus-circle',
};

export const font = {
  display: { fontSize: 28, fontWeight: '700', lineHeight: 38 },
  headline: { fontSize: 26, fontWeight: '700', lineHeight: 36 },
  title: { fontSize: 24, fontWeight: '700', lineHeight: 32 },
  subhead: { fontSize: 20, fontWeight: '600', lineHeight: 30 },
  button: { fontSize: 20, fontWeight: '700', lineHeight: 28 },
  body: { fontSize: 18, fontWeight: '400', lineHeight: 28 },
  caption: { fontSize: 16, fontWeight: '400', lineHeight: 24 },
} as const;

export const space = { screenX: 20, section: 28, item: 12, buttonGap: 12 } as const;

export const size = {
  buttonMinHeight: 60,
  inputMinHeight: 64,
  touchMin: 48,
  verdictIcon: 48,
} as const;

export const radius = { button: 14, card: 16 } as const;
export const border = { verdictStripe: 6, outline: 2 } as const;

/** 명세 §6.2 — 시스템 글자 크기 확대 상한 */
export const MAX_FONT_SCALE = 1.6;
