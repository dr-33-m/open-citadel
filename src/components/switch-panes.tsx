import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { KeptAlive } from '@/components/kept-alive';
import { easing, motion } from '@/constants/theme';

/**
 * How far a pane travels as it changes places: the same short step as the
 * Library's sides (`ViewSwitcher`). Enough to say which way the other one
 * lies, the way the switch's card just slid, and no further.
 */
const SHIFT = 16;
/** `slow` (250ms): a cross-fade of content, the house scale's slowest step. */
const TIMING = { duration: motion.slow, easing };

const styles = StyleSheet.create({
  /** A pane that is not the chosen one lies over the chosen one's place, taking no room of its own. */
  under: { position: 'absolute', left: 0, right: 0, top: 0 },
});

type PaneProps = {
  active: boolean;
  /** Shown from its first frame: the pane the panel opened on. */
  startShown: boolean;
  /** Which way the last switch went: 1 to the right, -1 to the left. */
  direction: number;
  warm: boolean;
  children: React.ReactNode;
};

/**
 * One choice's content: fully shown or gone, easing between the two. Coming
 * in, it steps in from the direction of the switch; going out, it steps away
 * the other way.
 *
 * Only the chosen pane is in the layout, so the panel is always exactly as
 * tall as what it shows. The one leaving is lifted out of the flow and fades
 * where it stood, over the one arriving. Opacity and translation only, on the
 * UI thread: nothing is hidden with `display`, which detaches native views and
 * was the stutter under the old switch.
 */
function Pane({ active, startShown, direction, warm, children }: PaneProps) {
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(startShown ? 1 : 0);
  React.useEffect(() => {
    shown.set(withTiming(active ? 1 : 0, TIMING));
  }, [active, shown]);

  const offset = reduceMotion ? 0 : SHIFT * (active ? direction : -direction);
  const style = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateX: (1 - shown.get()) * offset }],
  }));

  return (
    <Animated.View style={[active ? null : styles.under, style]} pointerEvents={active ? 'auto' : 'none'}>
      {/* Built when first chosen, or ahead of that when the host says it is
          at rest (`warm`), then kept. `visible`: this view does the hiding. */}
      <KeptAlive active={active} warm={warm} visible>
        {children}
      </KeptAlive>
    </Animated.View>
  );
}

export interface SwitchPanesProps<K extends string> {
  /** The choices, left to right as their switch draws them. */
  order: readonly K[];
  value: K;
  /** Each choice's content, or null where it is not on offer. */
  panes: Record<K, React.ReactNode | null>;
  /** Build the panes that are not showing while they are hidden. See `KeptAlive`. */
  warm?: boolean;
}

/**
 * What is under a switch: each choice's own content, trading places when the
 * switch moves. Built for the reading voice's Lite / Enhanced switch, and
 * used wherever two or three things take turns under the control that picks
 * between them (the voice's on-device and cloud sides, the brains and voices
 * of a plan's info sheet).
 *
 * Everything that belongs to a choice is in its pane (under Lite: its one
 * line, its voice, its reading speed), so the whole of it leaves and arrives
 * together, the way the card above it travelled. That is what makes the
 * switch read as one control with one result instead of a row of things
 * changing separately.
 *
 * Under Reduce Motion there is no travel: the panes cross-fade in place.
 */
export function SwitchPanes<K extends string>({ order, value, panes, warm = false }: SwitchPanesProps<K>) {
  // Which way the switch last moved, set while rendering so the panes get it
  // in the same render as the new value.
  const [last, setLast] = React.useState({ value, direction: 1 });
  const [openedOn] = React.useState(value);
  if (last.value !== value) {
    setLast({ value, direction: order.indexOf(value) >= order.indexOf(last.value) ? 1 : -1 });
  }

  return (
    <Animated.View>
      {order.map((key) =>
        panes[key] ? (
          <Pane key={key} active={key === value} startShown={key === openedOn} direction={last.direction} warm={warm}>
            {panes[key]}
          </Pane>
        ) : null,
      )}
    </Animated.View>
  );
}
