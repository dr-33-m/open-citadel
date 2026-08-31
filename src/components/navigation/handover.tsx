import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';

import { easing, motion } from '@/constants/theme';
import { useAfterFirstPaint } from '@/navigation/use-after-first-paint';

const FILL: { flex: 1 } = { flex: 1 };

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
 */
export function Handover({
  skeleton,
  surface = 'background',
  ready = true,
  children,
}: {
  skeleton: React.ReactNode;
  /** The ground this sits on, so the cover is opaque against it. */
  surface?: 'background' | 'popover';
  /** Hold the body back until this is true — see the note above. */
  ready?: boolean;
  children: React.ReactNode;
}) {
  const painted = useAfterFirstPaint();
  const mounted = painted && ready;
  const [covered, setCovered] = React.useState(true);

  React.useEffect(() => {
    if (!mounted) return undefined;
    // Two frames again, for the same reason `useAfterFirstPaint` uses two: the
    // first fires before the commit that mounted the content has been painted,
    // so uncovering from inside it would uncover onto nothing.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setCovered(false));
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
    };
  }, [mounted]);

  return (
    <View style={FILL}>
      {mounted ? children : null}
      {covered ? (
        <Animated.View
          // Never in the way of a tap: by the time this is fading, the content
          // beneath it is real and pressable.
          pointerEvents="none"
          className={surface === 'popover' ? 'bg-popover' : 'bg-background'}
          style={StyleSheet.absoluteFill}
          exiting={FadeOut.duration(motion.base).easing(easing)}
        >
          {skeleton}
        </Animated.View>
      ) : null}
    </View>
  );
}
