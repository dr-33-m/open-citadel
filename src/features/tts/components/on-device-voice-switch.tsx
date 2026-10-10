import React from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { easing, elevation, motion } from '@/constants/theme';
import { ON_DEVICE_KINDS } from '@/features/tts/utils/voice-copy';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { OnDeviceMode } from '@/services/device-tts/catalogue';

/** `base` (180ms): the same travel as the app's other switches. */
const TIMING = { duration: motion.base, easing };

export interface OnDeviceVoiceSwitchProps {
  mode: OnDeviceMode;
  onChange: (mode: OnDeviceMode) => void;
}

/**
 * The two kinds of on-device voice, as one switch: Lite, the phone's own, and
 * Enhanced, the ones Open Citadel downloads.
 *
 * The same lifted card that slides between cells as `IconSwitch`, with words
 * in the cells instead of icons: the two kinds have no icon that tells them
 * apart, and their names do. What each kind is, and its controls, are under
 * it and trade places as it moves (`VoiceKindPanes`).
 *
 * ## Why it is built the way it is
 *
 * It stuttered on a Galaxy A33, for two reasons, and both are designed out:
 *
 * - The card leaves in the frame of the touch. The press moves it itself, on
 *   the UI thread, and only then tells the panel, so it never waits for the
 *   panel to redraw what is under the switch. It used to follow the `mode`
 *   prop, which arrives a whole render later.
 * - Only `transform` and `opacity` are animated. The card's width used to be
 *   in the animated style, and a layout property there sends every frame of
 *   the slide through a layout pass. It is half the row by plain styling now,
 *   and the measured cell is used only to know how far to travel.
 */
export function OnDeviceVoiceSwitch({ mode, onChange }: OnDeviceVoiceSwitchProps) {
  const tokens = useThemeTokens();
  const reduceMotion = useReducedMotion();
  const index = ON_DEVICE_KINDS.findIndex((kind) => kind.mode === mode);

  /** One cell's width, once the row has been measured. */
  const cell = useSharedValue(0);
  /** Where the card is, in cells. */
  const slot = useSharedValue(index);
  /** Where the card was last sent, so a render that only confirms a press does not send it again. */
  const sentTo = React.useRef(index);

  const send = (to: number) => {
    sentTo.current = to;
    slot.set(reduceMotion ? to : withTiming(to, TIMING));
  };

  // Changed from somewhere else (the reader's own voice sheet, with this page
  // still open beneath it): the card follows.
  React.useEffect(() => {
    if (sentTo.current === index) return;
    sentTo.current = index;
    slot.set(reduceMotion ? index : withTiming(index, TIMING));
  }, [index, reduceMotion, slot]);

  const pillStyle = useAnimatedStyle(() => ({
    // Hidden until the row has been measured, so it never draws in the wrong cell.
    opacity: cell.get() > 0 ? 1 : 0,
    transform: [{ translateX: slot.get() * cell.get() }],
  }));

  const measure = (event: LayoutChangeEvent) => {
    cell.set(event.nativeEvent.layout.width / ON_DEVICE_KINDS.length);
  };

  return (
    <View className="flex-row border border-border bg-muted" accessibilityRole="tablist" onLayout={measure}>
      <Animated.View pointerEvents="none" className="absolute bottom-0 left-0 top-0 w-1/2 bg-card" style={[elevation.soft, pillStyle]} />
      {ON_DEVICE_KINDS.map((kind, at) => {
        const selected = kind.mode === mode;
        const press = () => {
          send(at);
          onChange(kind.mode);
        };
        return (
          <Touchable
            key={kind.mode}
            className="h-10 flex-1 items-center justify-center"
            onPress={selected ? undefined : press}
            haptic="select"
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${kind.name} voices`}
          >
            <ThemedText type="labelSm" color={selected ? tokens['--color-primary'] : tokens['--color-muted-foreground']}>
              {kind.name.toUpperCase()}
            </ThemedText>
          </Touchable>
        );
      })}
    </View>
  );
}
