import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';

import { easing, motion } from '@/constants/theme';
import { useAfterFirstPaint } from '@/navigation/use-after-first-paint';

const FILL: { flex: 1 } = { flex: 1 };
const CLIP: { overflow: 'hidden' } = { overflow: 'hidden' };

/**
 * Holds an expensive region behind a placeholder, then dissolves the
 * placeholder into the real thing.
 *
 * Two separate problems, and the second is the one that is easy to get wrong.
 *
 * **Starting late.** A screen or sheet that renders everything in one pass
 * blocks its own entrance: the transition has nothing to animate until the
 * body has mounted and committed. Mounting the body a frame later lets the
 * entrance start on the frame of the tap and pays the mount cost while the
 * thing is already moving.
 *
 * **The blank frame.** Swapping the placeholder out on the same commit that
 * mounts the content leaves a gap: the content has been *mounted*, but it has
 * not *painted* — a virtualized list still has to measure and lay out its
 * first window — so for a frame or two there is nothing on screen at all. That
 * is the skeleton → blank → content flicker, and it reads worse than no
 * placeholder at all, because the eye has already settled on something.
 *
 * So the placeholder is not removed when the content mounts. It stays on top,
 * opaque, for two more frames — long enough for the content underneath to have
 * actually painted — and only then fades out to reveal it. The result is
 * skeleton → content with nothing in between.
 *
 * `ready` is how a caller says "the entrance is over, mount now". Mounting the
 * body while something is still animating is worse than mounting it late: the
 * commit competes with the animation for the UI thread and the motion stalls
 * partway, which reads as the thing jumping rather than arriving. Left `true`,
 * the body mounts as soon as the shell has painted.
 *
 * The overlay is opaque on purpose. A translucent placeholder would show the
 * content arriving through the gaps between its own bars, which is the same
 * pop in miniature. `surface` picks which ground it paints, because a sheet
 * sits on `popover` and a screen on `background`, and an overlay that guesses
 * wrong announces itself as a rectangle.
 *
 * `fill={false}` is for a region inside a page rather than the whole of one:
 * the part below a hero that is drawn at once (an episode's notes under its
 * artwork and buttons). Until the body mounts, the placeholder sits in the
 * page's flow and holds the region's height; once it has, the placeholder
 * covers the body as above, clipped to the body's size so a placeholder
 * taller than the content never hangs over whatever follows.
 */
export function Handover({
  skeleton,
  surface = 'background',
  ready = true,
  fill = true,
  onShown,
  children,
}: {
  skeleton: React.ReactNode;
  /** The ground this sits on, so the cover is opaque against it. */
  surface?: 'background' | 'popover';
  /** Hold the body back until this is true — see the note above. */
  ready?: boolean;
  /** Fill the space it is given (a screen's body), or take the body's own height (a region of a page). */
  fill?: boolean;
  /**
   * Once the body has painted and the placeholder starts to go: the moment
   * the region is really there to use. A screen passes its time-to-interactive
   * marker (`useScreenInteractive`).
   */
  onShown?: () => void;
  children: React.ReactNode;
}) {
  const painted = useAfterFirstPaint();
  const mounted = painted && ready;
  const [covered, setCovered] = React.useState(true);
  // In a page's flow the placeholder is clipped to the body until it has
  // faded, so the clip outlasts `covered` by the length of the fade.
  const [clipped, setClipped] = React.useState(!fill);
  // Read through a ref so a caller's new function each render never re-runs the reveal.
  const shown = React.useRef(onShown);
  React.useEffect(() => {
    shown.current = onShown;
  }, [onShown]);

  React.useEffect(() => {
    if (covered || !clipped) return undefined;
    const timer = setTimeout(() => setClipped(false), motion.base);
    return () => clearTimeout(timer);
  }, [covered, clipped]);

  React.useEffect(() => {
    if (!mounted) return undefined;
    // Two frames again, for the same reason `useAfterFirstPaint` uses two: the
    // first fires before the commit that mounted the content has been painted,
    // so uncovering from inside it would uncover onto nothing.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        setCovered(false);
        shown.current?.();
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
    };
  }, [mounted]);

  // In flow, the placeholder is laid out as the region until the body is there
  // to take its place.
  const coverStyle = fill || mounted ? StyleSheet.absoluteFill : undefined;
  const regionStyle = fill ? FILL : clipped && mounted ? CLIP : undefined;

  return (
    <View style={regionStyle}>
      {mounted ? children : null}
      {covered ? (
        <Animated.View
          // Never in the way of a tap: by the time this is fading, the content
          // beneath it is real and pressable.
          pointerEvents="none"
          // Faded as one picture. Android otherwise applies the opacity to
          // each child in turn, so mid-fade the cover's own ground is laid
          // half over the content and its tiles half over that: a cover
          // identical to the content beneath still washed it out and back.
          needsOffscreenAlphaCompositing
          className={surface === 'popover' ? 'bg-popover' : 'bg-background'}
          style={coverStyle}
          exiting={FadeOut.duration(motion.base).easing(easing)}
        >
          {skeleton}
        </Animated.View>
      ) : null}
    </View>
  );
}
