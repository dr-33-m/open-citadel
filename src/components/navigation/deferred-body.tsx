import React from 'react';
import { View } from 'react-native';

import { useAfterFirstPaint } from '@/navigation/use-after-first-paint';

type DeferredBodyProps = {
  children: React.ReactNode;
};

/**
 * The heavy body of a screen, held back until the frame after the shell
 * paints (see `useAfterFirstPaint`).
 *
 * The point is only ever the dead time before a push starts: a screen that
 * renders everything in one pass blocks the navigator before it has anything
 * to animate, so the app freezes for the length of the mount and then moves.
 * Splitting the render in two lets the push begin immediately and pays the
 * mount cost while the screen is already travelling — the transition is a
 * worklet driving a spring on the UI thread, so a busy JS thread does not
 * slow it down.
 *
 * There is deliberately nothing here to fill the gap. This used to hold a
 * skeleton, and to wait for the whole transition to settle before mounting
 * anything, which turned a one-frame handover into half a second of grey
 * blocks and a slow cross-fade over content that had been ready the whole
 * time. What arrives instead is the screen itself, its sections revealing in
 * sequence (`components/navigation/reveal`) — the same moment, filled with
 * the thing the user asked for rather than a drawing of it.
 */
export function DeferredBody({ children }: DeferredBodyProps) {
  const painted = useAfterFirstPaint();

  return <View style={{ flex: 1 }}>{painted && children}</View>;
}
