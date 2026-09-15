import {
  Extrapolation,
  interpolate,
  interpolateColor,
  type SharedValue,
} from 'react-native-reanimated';
import Transition from 'react-native-screen-transitions';
import type { ScreenTransitionConfig } from 'react-native-screen-transitions';

/*
 * There is deliberately no custom `contentComponent` here.
 *
 * This file used to supply one whose only job was to set
 * `renderToHardwareTextureAndroid` on the content layer permanently. React
 * Native's own documentation forbids exactly that: "this can use up limited
 * video memory, so this prop should be set back to false at the end of the
 * interaction/animation" — and nothing here ever set it back. Every screen
 * held a full-screen GPU texture for as long as it stayed mounted, which in
 * this app is indefinitely: the stack keeps inactive screens, Settings is
 * `inactiveBehavior: 'keep'`, and the hub pager keeps all three of its pages.
 * Video memory only ever grew, and a cached layer that is never invalidated
 * shows a stale snapshot — a screen that has stopped repainting is a screen
 * that looks frozen.
 *
 * The library's default content layer is otherwise identical to what that
 * component rendered (see `screen-container/layers/content.tsx`: same
 * `Animated.View`, same styles, same animatedProps, same pointerEvents), so
 * omitting the option is the whole fix. If Android transform jank ever needs
 * the hint again it has to be scoped to the transition itself — driven from
 * `useScreenAnimation()` so it is true while progress is moving and false at
 * rest — never left on.
 */

/**
 * The app's screen-transition vocabulary.
 *
 * Navigation here is hub-and-spoke, not a stack of pages: the Library is the
 * hub, and Timeline and Samwell sit to its left and right. A screen therefore
 * has a *side* — a place it lives relative to the hub — and its transition is
 * that side made visible: it enters from its own edge, and it is dismissed
 * back toward that same edge. Settings is the exception; it belongs to no side
 * and rises over whatever is on screen.
 *
 * One interpolator covers a screen's whole life, because `progress` is 0–2:
 * 0 = off stage, 1 = focused, 2 = fully covered by the screen above. That
 * second half is why every screen — the hub included — carries a config, and
 * why `meta.enterFrom` exists: a covered screen has to know which way the
 * thing covering it arrived from so it can recede the other way.
 */

/** Which edge a screen belongs to. `0` is "no side" — it arrives from below. */
export type ScreenSide = -1 | 0 | 1;

/**
 * How far a covered screen travels, as a fraction of the screen width. A
 * quarter is enough to read as one connected surface sliding under the next;
 * more than that and the two screens stop feeling adjacent.
 */
const PARALLAX = 0.25;

/**
 * How far a screen shrinks when a drawer rises over it.
 *
 * A drawer arrives from below and belongs to no side, so there is no sideways
 * for the screen underneath to travel — it recedes in place instead, the way a
 * card modal pushes its parent back. Shallow on purpose: this reads as depth,
 * and anything deeper reads as the page falling away.
 */
const RECEDE_SCALE = 0.94;

/**
 * `duration` on these specs is the spring's *perceptual* duration; the real
 * settle is 1.5x it. Every number below is therefore two-thirds of the time it
 * should feel like, and that multiplier is the reason the old 350/400 values
 * ran 525ms and 600ms on screen — half again longer than iOS's own push, which
 * is what made a tap feel like it was waiting on something.
 *
 * Open and close are separate on purpose. A push is tap-driven: no finger was
 * in it, so it settles critically damped with no overshoot. A dismiss is
 * finger-driven and arrives carrying the release velocity, so it gets a little
 * bounce — momentum has to land somewhere or the screen reads as hitting a
 * wall — and it is faster than the open, because an exit is the system
 * responding rather than the user deciding.
 */

/** Tap-driven and frequent, so it settles fast and never overshoots. */
const SIDE_OPEN = { duration: 220, dampingRatio: 1 } as const;

/** Finger-driven, so it keeps the flick's momentum and leaves faster than it came. */
const SIDE_CLOSE = { duration: 190, dampingRatio: 0.86 } as const;

/** Reduce Motion collapses every spatial transition to this. */
const FADE_SPEC = { duration: 150, dampingRatio: 1 } as const;

/**
 * How much the release velocity counts toward the dismiss decision. The
 * library commits when `translation/width + velocity/width * this > 0.5`, so
 * at its default of 0.3 a drag had to cross half the screen unless it was
 * flung hard — which is the whole of "the gesture is difficult to trigger".
 * At 0.9 an ordinary flick of a couple of hundred px/s carries it, and a slow
 * deliberate drag still has to travel the distance, which is the point: speed
 * OR distance, never distance alone.
 */
const VELOCITY_IMPACT = 0.9;

type SideOptions = {
  side: Exclude<ScreenSide, 0>;
  /**
   * The theme's `--color-scrim`, resolved by the caller — an interpolator is a
   * worklet and cannot read a CSS variable itself.
   *
   * A shared value rather than a plain string so a theme switch does not
   * rebuild every screen's transition config: a worklet reads `.value` on the
   * frame it runs, so the new colour is picked up without the navigator having
   * to re-register a single screen option.
   */
  scrim: SharedValue<string>;
  /**
   * Restricts the dismiss gesture to a strip at the screen's own edge, for
   * screens whose content pans horizontally itself. Without this the reader's
   * page-turn swipe and the back gesture are the same movement.
   */
  edgeOnly?: boolean;
};

/**
 * Reads how the screen covering this one arrived. Screens with no side (the
 * drawer) report 0, which zeroes the parallax below rather than shoving the
 * covered screen sideways for a transition that has no sideways in it.
 */
function coveringSide(next: { meta?: Record<string, unknown> } | undefined): number {
  'worklet';
  if (!next) return 0;
  const from = next.meta?.enterFrom;
  return typeof from === 'number' ? from : 1;
}

/** A screen that lives to one side of the hub. */
export function sideTransition({ side, scrim, edgeOnly }: SideOptions): ScreenTransitionConfig {
  return {
    gestureEnabled: true,
    // "horizontal" is a drag to the right, "horizontal-inverted" a drag to the
    // left: a screen is always pushed back out the edge it came in through.
    gestureDirection: edgeOnly
      ? [{ gesture: side === 1 ? 'horizontal' : 'horizontal-inverted', area: 'edge' }]
      : side === 1
        ? 'horizontal'
        : 'horizontal-inverted',
    meta: { enterFrom: side },
    transitionSpec: { open: SIDE_OPEN, close: SIDE_CLOSE },
    gestureVelocityImpact: VELOCITY_IMPACT,
    screenStyleInterpolator: (args) => {
      'worklet';
      // Read defensively rather than destructuring in the signature. The
      // library runs this inside a try/catch and answers ANY throw by handing
      // the screen `NO_STYLES` — which paints as a blank screen, under a
      // warning that only says "screenStyleInterpolator must be a worklet".
      // A missing layout for one frame during a mount/teardown race must not
      // cost the whole screen its styles.
      const { progress, next } = args;
      const width = args.layouts?.screen?.width ?? 0;
      const covering = coveringSide(next);
      const translateX = interpolate(
        progress,
        [0, 1, 2],
        [side * width, 0, -covering * width * PARALLAX],
      );
      // Covered by a drawer (`covering === 0`): it rises over this screen
      // rather than pushing it aside, so this screen recedes in place. Covered
      // by a side screen: the parallax above already says it.
      const scale = interpolate(
        progress,
        [1, 2],
        [1, covering === 0 ? RECEDE_SCALE : 1],
        Extrapolation.CLAMP,
      );
      const dim = scrim.value || 'transparent';
      return {
        content: { style: { transform: [{ translateX }, { scale }] } },
        backdrop: {
          style: {
            // Only one dim per pair of screens. A side screen carries its own
            // backdrop, so a screen it covers stays clear; a drawer carries
            // none at all (one less full-screen animated surface per frame),
            // so the screen underneath does the dimming for it.
            backgroundColor: next
              ? covering === 0
                ? interpolateColor(progress, [1, 2], ['transparent', dim])
                : 'transparent'
              : interpolateColor(progress, [0, 1], ['transparent', dim]),
          },
        },
      };
    },
  };
}

/**
 * The hub. Same covered-phase motion as its neighbours so the three screens
 * move as one surface, but no dismiss gesture of its own: there is nothing
 * below the Library to go back to, and a live gesture here would compete with
 * the swipe that opens its neighbours (see `components/navigation/hub-swipe`).
 */
export function hubTransition({ scrim }: { scrim: SharedValue<string> }): ScreenTransitionConfig {
  return { ...sideTransition({ side: 1, scrim }), gestureEnabled: false };
}

/**
 * A full-screen drawer: rises over whatever is on screen, drags down to close.
 *
 * Built on the library's `SlideFromBottom` preset — its spring, its vertical
 * dismiss gesture and its scroll coordination — with two corrections spread
 * over the top.
 *
 * **`meta.enterFrom`.** The preset does not declare one, and `coveringSide`
 * falls back to 1 for anything that does not. So every screen a drawer covered
 * was told it had been covered from the right, and slid a quarter of the screen
 * width sideways while the drawer rose vertically over it. Two screens moving
 * on different axes at once is what made this read as a merge rather than a
 * transition — worst on the Library, where both screens are grids of book
 * covers and the sideways slide had nothing to distinguish it from the rise.
 * Declaring 0 ("no side") is what makes `coveringSide` return 0 and the screen
 * underneath hold still.
 *
 * **The covered phase.** The preset sends a covered drawer a full screen height
 * upward, so a drawer covered by a second drawer leaves upward while the new
 * one arrives from below — the same crossing motion, one level down. Clamped
 * here: a covered drawer recedes in place like any other covered screen.
 */
export function drawerTransition({ scrim }: { scrim: SharedValue<string> }): ScreenTransitionConfig {
  return {
    ...Transition.Presets.SlideFromBottom(),
    meta: { enterFrom: 0 },
    screenStyleInterpolator: (args) => {
      'worklet';
      // Defensive reads — see the note in `sideTransition`.
      const { progress, next } = args;
      const height = args.layouts?.screen?.height ?? 0;
      const covering = coveringSide(next);
      // Clamped at 1: the rise is the whole of this screen's own motion, and
      // being covered must not send it travelling again.
      const translateY = interpolate(progress, [0, 1], [height, 0], Extrapolation.CLAMP);
      const scale = interpolate(
        progress,
        [1, 2],
        [1, covering === 0 ? RECEDE_SCALE : 1],
        Extrapolation.CLAMP,
      );
      const dim = scrim.value || 'transparent';
      return {
        content: { style: { transform: [{ translateY }, { scale }] } },
        backdrop: {
          style: {
            backgroundColor:
              next && covering === 0
                ? interpolateColor(progress, [1, 2], ['transparent', dim])
                : 'transparent',
          },
        },
      };
    },
  };
}

/**
 * The Reduce Motion substitute for all of the above. Spatial motion is exactly
 * what that setting asks us to drop, so every screen cross-fades in place and
 * the dismiss gesture goes with it — the header buttons and the system back
 * are the way out.
 */
export function fadeTransition(): ScreenTransitionConfig {
  return {
    gestureEnabled: false,
    meta: { enterFrom: 0 },
    transitionSpec: { open: FADE_SPEC, close: FADE_SPEC },
    screenStyleInterpolator: (args) => {
      'worklet';
      return {
        content: {
          style: {
            opacity: interpolate(args.progress, [0, 1, 2], [0, 1, 1], Extrapolation.CLAMP),
          },
        },
      };
    },
  };
}
