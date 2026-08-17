// ── Colors: Obsidian & Gold (dark) ───────────────────────────────────
export const darkColors = {
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

// ── Colors: Parchment & Gold (light) ─────────────────────────────────
export const lightColors = {
  surface: {
    base: '#F5EEE0',
    low: '#FDFAF4',
    mid: '#EDE5D4',
    highest: '#C4B89A',
  },
  primary: {
    default: '#B8861A',
    container: '#9A7015',
  },
  text: {
    primary: '#1C1510',
    secondary: '#6B6050',
    inverse: '#F5EEE0',
  },
  outline: {
    variant: 'rgba(28, 21, 16, 0.12)',
  },
} as const;

export type AppColors = typeof darkColors;

// Default export kept for non-component usage (always dark)
export const colors = darkColors;

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

// ── Citadel Frame ────────────────────────────────────────────────────
// The house design language: sharp geometry, restrained colour, hierarchy from
// light and spacing rather than decoration. Corners stay at 0 throughout, the one
// place we go harder than the framework: square edges are the house signature.

/**
 * Depth comes from light, not blur. One architectural shadow, low opacity, so
 * layers separate without floating. Level 0 is the background, level 1 is cards,
 * level 2 is reserved: the focus card, Compass, the floating button, the active
 * nav cell. Nothing else earns it.
 */
export const elevation = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 30,
    elevation: 4,
  },
} as const;

/** Stroke icons only, never filled. */
export const iconSize = {
  default: 22,
  nav: 24,
  hero: 28,
} as const;

/** Slow and elegant, no spring physics. Pair with an ease-out curve. */
export const motion = {
  fast: 120,
  base: 180,
  slow: 250,
} as const;

// ── Layout ───────────────────────────────────────────────────────────
export const MaxContentWidth = 800;
