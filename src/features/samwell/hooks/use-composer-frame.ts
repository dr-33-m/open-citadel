import React from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';

import { spacing } from '@/constants/theme';
import { useSamwellUiStore } from '@/stores/samwell-ui';

/** Breathing room between the card and the top of the keyboard. */
export const KEYBOARD_GAP = spacing[3];

/**
 * Where the floating card sits: lifted over the keyboard, and measured for
 * what the conversation keeps clear of.
 *
 * The lift is a transform rather than a spacer growing under the card, which
 * would be a layout pass every frame the keyboard moves. The gap keeps the
 * keyboard's edge from clipping the card's border.
 */
export function useComposerFrame(bottomInset: number) {
  const setComposerHeight = useSamwellUiStore((s) => s.setComposerHeight);
  const onCardLayout = React.useCallback(
    (e: LayoutChangeEvent) => setComposerHeight(e.nativeEvent.layout.height + bottomInset),
    [setComposerHeight, bottomInset],
  );

  const keyboard = useAnimatedKeyboard();
  const liftStyle = useAnimatedStyle(() => {
    const height = keyboard.height.get();
    const lift = height > 0 ? Math.max(0, height + KEYBOARD_GAP - bottomInset) : 0;
    return { transform: [{ translateY: -lift }] };
  });

  return { onCardLayout, liftStyle };
}
