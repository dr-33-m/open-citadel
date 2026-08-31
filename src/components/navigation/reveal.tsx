import React from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { withUniwind } from 'uniwind';

import { revealIn } from '@/constants/theme';

type RevealProps = {
  /**
   * Position in the cascade. Sections on one screen should number from 0 in
   * the order they are read, top to bottom — the delay is what makes the
   * screen read as filling in rather than as several things happening at
   * once, and it only works if it agrees with the layout.
   */
  index?: number;
  className?: string;
  style?: StyleProp<ViewStyle>;
  /** Passed through: a revealed section is still the section being measured. */
  onLayout?: (event: LayoutChangeEvent) => void;
  children: React.ReactNode;
};

function RevealBase({ index = 0, className, style, onLayout, children }: RevealProps) {
  // Reanimated rebuilds an inline entering builder on every render; memoizing
  // on the one input keeps it stable for the life of the section.
  const entering = React.useMemo(() => revealIn(index), [index]);

  return (
    <Animated.View entering={entering} className={className} style={style} onLayout={onLayout}>
      {children}
    </Animated.View>
  );
}

/**
 * One section of a screen, arriving a beat after the one above it.
 *
 * Wrap the top-level regions of a screen body, not individual rows: the
 * cascade is meant to describe the screen's structure, and staggering every
 * row turns a 200ms reveal into something the user waits through. Rows that
 * genuinely arrive on their own — a list that grows, a message that lands —
 * animate themselves.
 *
 * It takes the section's own `className`, so it replaces the section's
 * wrapper rather than adding a layer above it — a reveal should not cost a
 * view per section.
 *
 * Mounts once. Screens in this app stay mounted while inactive, so this plays
 * on a screen's first visit and never again; coming back to a screen that is
 * already built shows it immediately, which is the correct behaviour and not
 * an oversight. An entrance is for content the user is waiting on.
 *
 * `className` is retrofitted the same way `Touchable` does it and for the
 * same reason: Uniwind only auto-instruments React Native's own built-ins,
 * and this is an app component wrapping a Reanimated view.
 */
export const Reveal = withUniwind(RevealBase);
