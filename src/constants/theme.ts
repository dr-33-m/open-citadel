import { Easing, ReduceMotion, withDelay, withTiming } from 'react-native-reanimated';

/*
 * The JS colour palette that used to live here was retired in the PanelUI
 * migration: every colour is now a semantic token in `src/theme.css`, read
 * through Uniwind classes or `useCSSVariable`. This module keeps only the
 * non-colour design tokens — type, spacing, depth, motion, layout.
 */

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
  /**
   * The hero surface: the currently-reading card, the floating nav bar. One
   * step heavier than `soft` so it reads as the thing in front, but still a
   * near-even ambient shadow rather than a hard directional drop.
   */
  card: {
    boxShadow: '0 4px 18px rgba(0, 0, 0, 0.20)',
  },
  /**
   * Repeated items: book covers, timeline cards. Small offset and low opacity
   * so a shelf or a feed of them reads as one calm surface with a little
   * weight, not a field of floating tiles. Even on every side by design —
   * the light is ambient, not a spotlight.
   */
  soft: {
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.16)',
  },
} as const;

/** Stroke icons only, never filled. */
export const iconSize = {
  default: 22,
  nav: 24,
  hero: 28,
} as const;

/** Slow and elegant, no spring physics. Pair with an ease-out curve.
 *
 * Tiers, mapped to their moments: `fast` is press/state feedback and the
 * pulse loops (100–150ms budget), `base` is row and bubble entrances and
 * list reflow (150–200ms), `slow` is content reveals and cross-fades —
 * including a deferred screen body bridging the settle of a screen
 * transition (200–250ms). Group entrances step by `stagger`. */
export const motion = {
  fast: 120,
  base: 180,
  slow: 250,
  stagger: 40,
} as const;

/** The one curve every animation in the app uses — decelerating into rest,
 * never overshooting. This is what "no spring physics" means in practice. */
export const easing = Easing.out(Easing.cubic);

/** The same intent as `easing`, for Reanimated's CSS transitions. Use this
 * for two-state changes (press, focus, toggle) — a CSS transition runs on the
 * UI thread with no worklet and no shared value, which a plain state flip
 * should never need.
 *
 * A predefined keyword on purpose. `transitionTimingFunction` only parses the
 * CSS keywords and throws at render time on a `'cubic-bezier(...)'` string;
 * the `cubicBezier()` helper object clears that but then collides with React
 * Native's own `ViewStyle`, which types these props as strings, so it can't
 * sit in a style array or `StyleSheet.create`. Over a 120–180ms fade the
 * difference from a custom bezier isn't perceptible. */
export const easingCss = 'ease-out';

/**
 * The app's grow-in and shrink-out, for something small that appears in place:
 * an icon swapping for another, a control arriving on a screen already built.
 *
 * They exist because Reanimated's `ZoomIn`/`ZoomOut` travel all the way to and
 * from `scale(0)`, and nothing in the physical world appears out of, or
 * vanishes into, nothing — an element that does reads as conjured rather than
 * as arriving. Starting a hair under full size and carrying opacity does the
 * same job and reads as a real object entering the frame. The exit is quicker
 * than the entrance: leaving is the system responding, not the user deciding.
 *
 * Custom entering builders bypass the reduce-motion handling the presets get
 * for free, so each animation opts back into it explicitly. Under the setting
 * both resolve in a single frame, which is what "no movement" means here.
 *
 * ```tsx
 * <Animated.View entering={popIn()} exiting={popOut()} />
 * ```
 */
const POP_SCALE = 0.92;

export function popIn(duration: number = motion.fast) {
  return () => {
    'worklet';
    const config = { duration, easing, reduceMotion: ReduceMotion.System };
    return {
      initialValues: { opacity: 0, transform: [{ scale: POP_SCALE }] },
      animations: {
        opacity: withTiming(1, config),
        transform: [{ scale: withTiming(1, config) }],
      },
    };
  };
}

/**
 * A section arriving as part of a screen filling in: it rises a little and
 * fades up, a beat behind the one above it.
 *
 * This is what a screen shows instead of placeholder blocks. A skeleton is a
 * drawing of content that has not arrived, and it is worth its ugliness only
 * when the wait is real and long enough to need explaining. When the content
 * is a render away — which is the case on every screen in this app, because
 * the data is local — a grey outline of it is a picture of a problem the app
 * does not have. Revealing the real sections in sequence fills the same
 * moment with the thing the user came for, and reads as the screen composing
 * itself rather than as the screen waiting.
 *
 * The cascade is capped: past a handful of steps the delay stops being rhythm
 * and starts being a queue, and anything that far down the screen is below the
 * fold anyway. `withDelay` defaults to honouring the system reduce-motion
 * setting, which drops the delay along with the movement — under that setting
 * the whole screen simply appears, which is the point of it.
 *
 * ```tsx
 * <Animated.View entering={revealIn(0)}>…</Animated.View>
 * ```
 */
const REVEAL_RISE = 10;
const REVEAL_MAX_STEPS = 6;

export function revealIn(index: number = 0) {
  return () => {
    'worklet';
    const delay = Math.min(index, REVEAL_MAX_STEPS) * motion.stagger;
    const config = { duration: motion.base, easing, reduceMotion: ReduceMotion.System };
    return {
      initialValues: { opacity: 0, transform: [{ translateY: REVEAL_RISE }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, config)),
        transform: [{ translateY: withDelay(delay, withTiming(0, config)) }],
      },
    };
  };
}

export function popOut(duration: number = motion.fast) {
  return () => {
    'worklet';
    const config = { duration, easing, reduceMotion: ReduceMotion.System };
    return {
      initialValues: { opacity: 1, transform: [{ scale: 1 }] },
      animations: {
        opacity: withTiming(0, config),
        transform: [{ scale: withTiming(POP_SCALE, config) }],
      },
    };
  };
}

// ── Layout ───────────────────────────────────────────────────────────
export const MaxContentWidth = 800;

/**
 * The spacing system. `spacing` above is the *scale* (which numbers exist);
 * this is the *system* (which number to reach for). Before this existed the
 * app had five different screen gutters and section gaps ranging from 16 to
 * 80, which is what "no design system" looks like from the outside.
 *
 * Two rules cover almost every decision:
 *
 *  1. Horizontal position is the gutter, and there is one gutter per surface
 *     kind. Everything at the same depth lines up on the same vertical, so a
 *     screen reads as one column rather than a stack of unrelated slabs.
 *  2. Vertical distance encodes relationship. Further apart means less
 *     related, and the steps are 8 / 16 / 32 — one doubling apart, so the
 *     hierarchy is legible without measuring. Nothing gets a gap that isn't
 *     on this ladder.
 *
 * The class equivalents are in the comments: prefer the Uniwind class in
 * `className`, and these numbers only where a runtime style is unavoidable
 * (safe-area maths, measured heights, animated styles).
 */
export const layout = {
  /** Screen gutter — every screen's content, header and section headers. `px-6` */
  gutter: spacing[6],
  /**
   * Gutter for surfaces whose *rows* are the interactive target: menu sheets,
   * message lists, transcript rows. Denser on purpose — a row that fills more
   * of its surface reads as a control, where a narrow column of them reads as
   * a page with dead sides. `px-4`
   */
  gutterCompact: spacing[4],
  /** Padding inside a card, between its border and its content. `p-4` */
  cardPadding: spacing[4],

  /** Between two unrelated sections of a screen. `gap-8` */
  sectionGap: spacing[8],
  /** Between a section's header and its body, and between peers inside it. `gap-4` */
  blockGap: spacing[4],
  /** Between the parts of one thing — icon and label, title and subtitle. `gap-2` */
  itemGap: spacing[2],

  /** A screen's scroll content, from the header down to its first section. `pt-6` */
  screenTop: spacing[6],
  /**
   * Trailing scroll clearance, added to whatever chrome floats over the
   * bottom (tab bar, composer) so the last row is never stuck under it.
   */
  scrollBottom: spacing[8],

  /**
   * Sheet content, from the sheet's own chrome down to the first row. The
   * sheet shell owns this — see `components/ui/sheet.tsx`. Sheets do NOT get
   * bottom padding here: the shell already pays `max(insets.bottom, 16)`,
   * and the `pb-10` call sites used to add on top of it is where "huge
   * margin at the bottom of every sheet" came from.
   */
  sheetTop: spacing[5],
} as const;
