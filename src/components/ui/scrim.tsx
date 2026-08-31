/**
 * Scrim — the layer behind an overlay.
 *
 * An overlay needs the screen behind it to recede. There are two honest ways to
 * do that: dim it, or blur it. Dimming is free and always works; blurring reads
 * as more physical — the content behind stays legible as shape and colour while
 * losing its detail — but it needs a native view to do it.
 *
 * `expo-blur` is resolved lazily and only when `blur` is asked for, so a project
 * that never blurs anything installs nothing. When it is asked for and the
 * package is missing, this falls back to a dim rather than failing: a blur you
 * cannot draw is better shown as a darkened screen than as a crash.
 * Reduce Transparency replaces the blur with an opaque, tint-aware surface.
 *
 * It fills its parent and does not intercept touches itself — the overlay layers
 * its own dismiss `Pressable` over it — so it is purely the visual backdrop.
 */
import { useEffect, useState, type ComponentType } from 'react';
import { AccessibilityInfo, StyleSheet, View, type ViewProps } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  type EntryOrExitLayoutType,
} from 'react-native-reanimated';

type BlurTint = 'light' | 'dark' | 'default' | 'systemMaterial';

interface BlurViewProps {
  intensity?: number;
  tint?: BlurTint;
  style?: unknown;
  children?: React.ReactNode;
}

/**
 * `expo-blur`'s BlurView, or null when it is not installed. Resolved once at
 * module load — the require is cheap and caching it avoids a try/catch on every
 * render.
 */
const BlurView: ComponentType<BlurViewProps> | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-blur');
    return (mod?.BlurView as ComponentType<BlurViewProps>) ?? null;
  } catch {
    return null;
  }
})();

/** True when a real blur can be drawn — for a caller that wants to know. */
export const hasBlur = BlurView !== null;

type ReduceTransparencySource = {
  isReduceTransparencyEnabled?: () => Promise<boolean>;
  addEventListener?: (
    event: 'reduceTransparencyChanged',
    listener: (enabled: boolean) => void
  ) => { remove?: () => void } | undefined;
};

function observeReduceTransparency(
  source: ReduceTransparencySource,
  onChange: (enabled: boolean) => void
) {
  let active = true;
  let changed = false;
  const update = (enabled: boolean) => {
    changed = true;
    if (active) onChange(Boolean(enabled));
  };
  /*
   * A platform that cannot report the preference has no preference to respect,
   * so blur stays available. A platform that has the API and failed to answer
   * might have it switched on, and that is the case worth being careful about.
   */
  const fallback = (queryable: boolean) => () => {
    if (active && !changed) onChange(queryable);
  };

  let subscription: { remove?: () => void } | undefined;
  try {
    subscription = source.addEventListener?.('reduceTransparencyChanged', update);
  } catch {
    // Some web and test shims expose AccessibilityInfo without every event.
  }

  try {
    if (typeof source.isReduceTransparencyEnabled !== 'function') fallback(false)();
    else {
      void source.isReduceTransparencyEnabled().then((enabled) => {
        // A preference event that arrived while the query was pending is newer.
        if (active && !changed) update(enabled);
      }, fallback(true));
    }
  } catch {
    fallback(true)();
  }

  return () => {
    active = false;
    try {
      subscription?.remove?.();
    } catch {
      // Cleanup stays safe for partial platform shims.
    }
  };
}

/**
 * The last answer the platform gave, shared by every scrim in the process.
 *
 * The query is asynchronous and the preference belongs to the device, not to
 * any one overlay. Without this, each overlay opens not knowing it and draws
 * opaque until the answer arrives — a flash on every dialog for the many people
 * who have the preference off. Remembered here, only the first overlay of a
 * launch can see it.
 */
let knownReduceTransparency: boolean | null = null;

/**
 * Whether the device asks for Reduce Transparency: `true`, `false`, or `null`
 * while the platform has not answered yet. Exported because every material in
 * the library has to respect the same preference, and two copies of this would
 * be two answers.
 */
export function useReduceTransparency() {
  // Not knowing is deliberately conservative: draw opaque until the platform
  // says blur is allowed, rather than flashing blur at someone who opted out.
  const [enabled, setEnabled] = useState<boolean | null>(knownReduceTransparency);
  useEffect(
    () =>
      observeReduceTransparency(AccessibilityInfo, (next) => {
        knownReduceTransparency = next;
        setEnabled(next);
      }),
    []
  );
  return enabled;
}

type ScrimMode = 'blur' | 'dim' | 'opaque';

function scrimMode(blur: boolean, canBlur: boolean, reduceTransparency: boolean | null): ScrimMode {
  if (!blur) return 'dim';
  if (reduceTransparency !== false) return 'opaque';
  return canBlur ? 'blur' : 'dim';
}

function opaqueClassName(tint: BlurTint) {
  if (tint === 'light') return 'bg-white';
  if (tint === 'dark') return 'bg-black';
  return 'bg-background';
}

export interface ScrimProps extends Omit<ViewProps, 'children'> {
  /** Frost the backdrop instead of dimming it. Falls back to a dim if it can't. */
  blur?: boolean;
  /** Blur strength, 0–100. */
  intensity?: number;
  /** Which way the blur tints. */
  tint?: BlurTint;
  /**
   * The dim used when not blurring, when blur is unavailable, and over the
   * opaque Reduce Transparency fallback. A popover passes a lighter one than a dialog.
   */
  dimClassName?: string;
  /**
   * Whether the scrim fades itself in and out.
   *
   * On by default, for an overlay whose backdrop has no animation of its own
   * — a popover, say, where this fade *is* the backdrop's fade.
   *
   * Off when the caller already animates the layer this sits in, which is the
   * case for both a dialog (a `FadeIn`/`FadeOut` on the whole overlay) and a
   * bottom sheet (an opacity derived from how far the sheet has been dragged).
   * Two fades on one backdrop is wrong twice over. Opening, they multiply, so
   * the dim ramps as the square of the travel and arrives late. Closing is the
   * visible half: an exiting animation keeps this view alive for its own
   * duration *after* the parent carrying the real opacity has been unmounted,
   * so the backdrop snaps back to full strength for a beat before fading — a
   * flash of the screen going dark again just as the sheet finishes leaving.
   */
  animate?: boolean;
}

/** The prop surface `Scrim` drives its layer through — `View`'s own props
 * plus the two entrance/exit slots only the animated branch receives. */
type LayerProps = ViewProps & {
  entering?: EntryOrExitLayoutType;
  exiting?: EntryOrExitLayoutType;
};

export function Scrim({
  blur = false,
  intensity = 24,
  tint = 'default',
  dimClassName = 'bg-black/50',
  animate = true,
  style,
  ...props
}: ScrimProps) {
  const reduceTransparency = useReduceTransparency();
  const mode = scrimMode(blur, BlurView !== null, reduceTransparency);
  // A plain View when the caller owns the fade — not `Animated.View` with the
  // animations left off. An exiting animation is what strands this view on
  // screen after its parent has gone (see `animate`), and only a component
  // that never declares one cannot do that.
  // Reanimated 4.6 types `Animated.View` so that a bare union with `View`
  // has no call signature; the cast picks the one prop surface both
  // branches are actually used through.
  const Layer = (animate ? Animated.View : View) as ComponentType<LayerProps>;
  const fade = animate
    ? { entering: FadeIn.duration(180), exiting: FadeOut.duration(150) }
    : {};
  const quickFade = animate
    ? { entering: FadeIn.duration(150), exiting: FadeOut.duration(150) }
    : {};

  if (mode === 'blur' && BlurView) {
    return (
      <Layer {...fade} style={[StyleSheet.absoluteFill, style]} {...props}>
        {/* A faint dim under the blur so the frost has something to sit on —
            a pure blur over a dark scene is nearly invisible. */}
        <BlurView intensity={intensity} tint={tint} style={StyleSheet.absoluteFill} />
        <View className="absolute inset-0 bg-black/10" />
      </Layer>
    );
  }

  if (mode === 'opaque') {
    return (
      <Layer {...fade} style={[StyleSheet.absoluteFill, style]} {...props}>
        <View
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          className={opaqueClassName(tint)}
        />
        <View pointerEvents="none" style={StyleSheet.absoluteFill} className={dimClassName} />
      </Layer>
    );
  }

  return (
    <Layer
      {...quickFade}
      style={[StyleSheet.absoluteFill, style]}
      className={dimClassName}
      {...props}
    />
  );
}

Scrim.displayName = 'Scrim';
