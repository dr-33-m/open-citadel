import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { Touchable } from '@/components/ui/touchable';
import { easingCss, motion } from '@/constants/theme';
import { asColor } from '@/utils/colors';

/**
 * The highlight palette. One list, because the same five colours are the
 * highlight's colour in the reader, a thought's colour in the timeline, and
 * the filter in the table of contents — and three copies of the array is
 * three places for a sixth colour to be forgotten.
 */
// `readonly string[]`, not `as const`: these are user-chosen *data*, persisted
// per highlight and per thought, so the state that holds one is a `string` —
// narrowing to the five literals only makes every call site cast back.
export const HIGHLIGHT_COLORS: readonly string[] = [
  '#f2ca50', // gold
  '#e05252', // red
  '#52b788', // green
  '#4a90d9', // blue
  '#9b72cf', // purple
];

/**
 * One colour swatch, with its selection ring growing in rather than the border
 * snapping on. Selection is a two-state flip, so it is a CSS transition (UI
 * thread, no worklet) rather than a shared value per swatch.
 *
 * Shared, because the three places these appear had drifted into three sizes
 * and three selection treatments — 28dp with an animated 3px ring here, 28dp
 * with a hard 3px border in the timeline, 20dp with a hard 2px border in the
 * contents sheet — for what the reader is meant to recognise as one control.
 */
export function ColorSwatch({
  color,
  selected,
  onPress,
  accessibilityLabel,
}: {
  color: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const foreground = useCSSVariable('--color-foreground');

  return (
    <Touchable
      haptic="tap"
      className="h-7 w-7 rounded-[14px]"
      style={{ backgroundColor: color }}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.ring,
          { borderColor: asColor(foreground) },
          selected ? styles.ringOn : styles.ringOff,
        ]}
      />
    </Touchable>
  );
}

/**
 * The row the swatches sit in. `gap-3` between 28dp targets, so the run reads
 * as one control rather than five loose dots.
 */
export function ColorSwatchRow({ children }: { children: React.ReactNode }) {
  return <View className="flex-row gap-3">{children}</View>;
}

// The ring stays a StyleSheet: it animates through RN's CSS transition props
// (see the note on the component) and Reanimated's Animated.View takes
// `style=`, never className.
const styles = StyleSheet.create({
  ring: {
    borderWidth: 3,
    borderRadius: 14,
    transitionProperty: ['opacity', 'transform'],
    transitionDuration: `${motion.fast}ms`,
    transitionTimingFunction: easingCss,
  },
  ringOn: { opacity: 1, transform: [{ scale: 1 }] },
  ringOff: { opacity: 0, transform: [{ scale: 0.7 }] },
});
