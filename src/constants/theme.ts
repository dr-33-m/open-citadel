import { Platform } from 'react-native';

// ── Colors: Obsidian & Gold ──────────────────────────────────────────
export const colors = {
  surface: {
    base: '#131313',
    low: '#1c1b1b',
    mid: '#252525',
    highest: '#353534',
  },
  primary: {
    default: '#f2ca50',
    container: '#d4af37',
  },
  text: {
    primary: '#d0c5af',
    secondary: '#8a8378',
    inverse: '#131313',
  },
  outline: {
    variant: 'rgba(208, 197, 175, 0.15)',
  },
} as const;

// ── Typography: Font families ────────────────────────────────────────
// These match the keys loaded via useFonts in _layout.tsx
export const fontFamily = {
  serif: 'Newsreader_400Regular',
  serifItalic: 'Newsreader_400Regular_Italic',
  serifMedium: 'Newsreader_500Medium',
  serifBold: 'Newsreader_700Bold',
  serifBoldItalic: 'Newsreader_700Bold_Italic',
  sans: 'Manrope_400Regular',
  sansMedium: 'Manrope_500Medium',
  sansSemiBold: 'Manrope_600SemiBold',
  sansBold: 'Manrope_700Bold',
} as const;

// ── Typography: Type scale ───────────────────────────────────────────
export const typography = {
  displayLg: {
    fontFamily: fontFamily.serifBold,
    fontSize: 48,
    lineHeight: 56,
  },
  displayMd: {
    fontFamily: fontFamily.serifBold,
    fontSize: 36,
    lineHeight: 44,
  },
  headlineLg: {
    fontFamily: fontFamily.serifMedium,
    fontSize: 28,
    lineHeight: 36,
  },
  headlineMd: {
    fontFamily: fontFamily.serifMedium,
    fontSize: 22,
    lineHeight: 28,
  },
  headlineSm: {
    fontFamily: fontFamily.serifMedium,
    fontSize: 18,
    lineHeight: 24,
  },
  bodyLg: {
    fontFamily: fontFamily.sans,
    fontSize: 18,
    lineHeight: 28,
  },
  bodyMd: {
    fontFamily: fontFamily.sans,
    fontSize: 16,
    lineHeight: 24,
  },
  bodySm: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  labelLg: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 1.4,
    textTransform: 'uppercase' as const,
  },
  labelMd: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
  labelSm: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.1,
    textTransform: 'uppercase' as const,
  },
} as const;

export type TypographyVariant = keyof typeof typography;

// ── Spacing ──────────────────────────────────────────────────────────
export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
} as const;

// ── Layout ───────────────────────────────────────────────────────────
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
