/**
 * Collapse — a body that opens and closes by animating its own height.
 *
 * Height cannot be animated from `auto`, so the content is measured first and
 * the measurement is what gets animated to. While that is happening the content
 * is taken out of the flow, because a child of a view whose height is
 * mid-animation reports that animated height back and the panel then settles on
 * whatever it happened to measure.
 *
 * The moment the animation finishes, both go away and the content lays out
 * normally again. That is what lets a Collapse hold another Collapse — or hold
 * content that is still streaming in — without either of them being clipped to
 * a number that was true a frame ago.
 *
 * ```tsx
 * <Collapse open={open}>
 *   <Text>Anything, of any height.</Text>
 * </Collapse>
 * ```
 *
 * The alternative — unmounting the body and letting a layout transition on the
 * parent carry the change — is what `Accordion` does, and it is right when the
 * closed state should cost nothing. This is for a body that opens and closes
 * repeatedly and often while its content is still arriving, where remounting
 * would throw away scroll position and restart every animation inside it.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type ViewProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { cn } from '@/lib/cn';

/** Long enough to read as the panel opening, short enough not to be waited on. */
export const COLLAPSE_DURATION = 200;

export interface CollapseProps extends Omit<ViewProps, 'children'> {
  open: boolean;
  /** Classes on the measured content, not on the clipping frame. */
  className?: string;
  duration?: number;
  children?: ReactNode;
}

export function Collapse({
  open,
  className,
  duration = COLLAPSE_DURATION,
  children,
  ...props
}: CollapseProps) {
  const reducedMotion = useReducedMotion();
  /*
   * LOCAL EDIT: a shared value, not state. Re-apply after `panelui-cli update`.
   *
   * This is measured in `onLayout`, which runs AFTER paint. As JS state it
   * seeded at 0, so an opening animation ran `progress * 0` for its first
   * frames and then snapped once the measurement landed — the janky expand on
   * the reasoning trace.
   *
   * It was also a re-render per measurement. A body whose content is still
   * streaming relayouts constantly, and each one re-rendered this component
   * and rebuilt the animated style, in the middle of the animation it was
   * driving.
   *
   * On the UI thread neither happens: `onLayout` writes the number, the style
   * worklet reads whatever is current on the frame it runs, and a height that
   * arrives a frame late is simply picked up rather than needing a round trip
   * through React to be seen.
   */
  const height = useSharedValue(0);
  const [animating, setAnimating] = useState(false);
  const progress = useSharedValue(open ? 1 : 0);
  const mounted = useRef(false);

  useEffect(() => {
    // The first pass is not a transition — a body that starts open should be
    // open, not play its own entrance at nobody.
    if (!mounted.current) {
      mounted.current = true;
      progress.value = open ? 1 : 0;
      return;
    }
    if (reducedMotion) {
      progress.value = open ? 1 : 0;
      setAnimating(false);
      return;
    }
    setAnimating(true);
    progress.value = withTiming(open ? 1 : 0, { duration }, (finished) => {
      if (finished) scheduleOnRN(setAnimating, false);
    });
  }, [open, reducedMotion, duration, progress]);

  const style = useAnimatedStyle(() => ({
    height: progress.value * height.value,
    opacity: progress.value,
  }));

  // Re-measured rather than measured once: a body whose content is still
  // streaming in grows, and a height captured on the first frame would crop it.
  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    // Same 1px deadband as before, just without the re-render behind it.
    if (Math.abs(height.value - next) >= 1) height.value = next;
  };

  /*
   * Once it has finished opening, the measured height and the absolute
   * positioning are both dropped and the content lays out normally.
   *
   * They are only needed *while* the height is being animated to a number, and
   * keeping them costs real bugs: a Collapse whose content is itself a Collapse
   * measures a child that has not settled yet, and settles on that wrong
   * number, so the inner body ends up clipped to nothing. Content that is still
   * streaming in has the same problem against itself. In natural flow both are
   * simply laid out, and the measurement carries on in the background against
   * the next time it closes.
   */
  const natural = open && !animating;

  return (
    <Animated.View
      style={natural ? undefined : style}
      className={natural ? undefined : 'overflow-hidden'}
    >
      {/*
        The same two elements in both modes, so switching between them is a
        style change rather than a remount — a remount would throw away the
        state of everything inside.
      */}
      <View
        onLayout={onLayout}
        style={natural ? undefined : { position: 'absolute', left: 0, right: 0, top: 0 }}
        className={cn(className)}
        {...props}
      >
        {children}
      </View>
    </Animated.View>
  );
}
Collapse.displayName = 'Collapse';
