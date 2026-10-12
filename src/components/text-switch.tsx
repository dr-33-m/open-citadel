import React from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { Lock } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { easing, elevation, motion } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/** `base` (180ms): the same travel as the app's other switches. */
const TIMING = { duration: motion.base, easing };

export type TextSwitchOption<T extends string> = {
  value: T;
  /** As drawn: a short word, in the label face. */
  label: string;
  /**
   * Out of reach: drawn muted with a padlock, and the card does not go to
   * it. It still answers a press with `onChange`, because the way through a
   * lock (a plan, say) is the caller's to offer.
   */
  locked?: boolean;
  /** What a screen reader says in place of the label. */
  accessibilityLabel?: string;
};

export interface TextSwitchProps<T extends string> {
  options: readonly TextSwitchOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * A few kinds of one thing, as one switch: a lifted card that slides between
 * cells with words in them. The same card as `IconSwitch`, for kinds that
 * have no icon to tell them apart and names that do (Lite and Enhanced; the
 * cloud's voice boxes). What each kind is, and its controls, sit under it.
 *
 * ## Why it is built the way it is
 *
 * It stuttered on a Galaxy A33, for two reasons, and both are designed out:
 *
 * - The card leaves in the frame of the touch. The press moves it itself, on
 *   the UI thread, and only then tells the caller, so it never waits for the
 *   caller to redraw what is under the switch. It used to follow the value
 *   prop, which arrives a whole render later.
 * - Only `transform` and `opacity` are animated. The card's width used to be
 *   in the animated style, and a layout property there sends every frame of
 *   the slide through a layout pass. It is a share of the row by plain
 *   styling now, and the measured row is used only to know how far to travel.
 */
export function TextSwitch<T extends string>({ options, value, onChange }: TextSwitchProps<T>) {
  const tokens = useThemeTokens();
  const reduceMotion = useReducedMotion();
  const count = options.length;
  const index = options.findIndex((option) => option.value === value);

  /**
   * The track's width, once it has been measured. A cell is its share of it,
   * worked out where it is used: the row's width does not change when the
   * number of options does (a plan with two voice boxes after one with one),
   * so a cell measured once would go on being the old share.
   */
  const row = useSharedValue(0);
  /** Where the card is, in cells. Negative while nothing is chosen. */
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
    // Hidden until the row has been measured, so it never draws in the wrong
    // cell, and while nothing is chosen.
    opacity: row.get() > 0 && slot.get() >= 0 ? 1 : 0,
    transform: [{ translateX: (slot.get() * row.get()) / count }],
  }));

  const measure = (event: LayoutChangeEvent) => {
    row.set(event.nativeEvent.layout.width);
  };

  return (
    <View className="flex-row border border-border bg-muted" accessibilityRole="tablist">
      {/* The card's track: the row inside its border, which is what the card
          is a share of. Measured here and not on the row, whose own width
          counts the border: a card sent half of that went a point too far,
          over the right-hand border. */}
      <View pointerEvents="none" className="absolute inset-0" onLayout={measure}>
        <Animated.View
          className="absolute bottom-0 left-0 top-0 bg-card"
          style={[{ width: `${100 / count}%` }, elevation.soft, pillStyle]}
        />
      </View>
      {options.map((option, at) => {
        const selected = option.value === value;
        const press = () => {
          if (!option.locked) send(at);
          onChange(option.value);
        };
        const color = selected ? tokens['--color-primary'] : tokens['--color-muted-foreground'];
        return (
          <Touchable
            key={option.value}
            className="h-10 flex-1 flex-row items-center justify-center gap-1.5 px-1"
            onPress={selected ? undefined : press}
            haptic="select"
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.accessibilityLabel ?? option.label}
          >
            {option.locked ? <Lock size={11} color={color} strokeWidth={2} /> : null}
            {/* One line whatever the type size: three long names share a row. */}
            <ThemedText type="labelSm" color={color} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} className="shrink">
              {option.label}
            </ThemedText>
          </Touchable>
        );
      })}
    </View>
  );
}
