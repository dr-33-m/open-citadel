import React from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { ChevronDown, ChevronUp, ZodiacPisces } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Alert } from '@/components/ui/alert';
import { Touchable } from '@/components/ui/touchable';
import { useCollapseHeight } from '@/hooks/use-collapse-height';
import { asColor } from '@/utils/colors';

/**
 * A collapsed note from Samwell under a field, saying what he does with what
 * you write.
 *
 * ## Why it is folded away
 *
 * The reasons are worth reading once and then never again, and these sit on
 * surfaces that are mostly field: a log note dialog is a prompt, a box and two
 * buttons, and three lines of explanation between the box and the buttons is
 * the tallest thing on it. Somebody logging a shower for the fortieth time
 * does not need to be told what notes are for. So the argument is one row
 * until it is asked for, and the row still says who is talking.
 *
 * Closed by default, every time, deliberately. It is not a setting or a
 * dismissal to remember; it is a footnote you can open.
 *
 * ## What it is built from
 *
 * PanelUI's `Alert` on its `default` variant, which is the blended one: the
 * border and a `surface` fill, no status colour. `info` would paint it blue
 * and turn a note from him into a system message, and none of these are
 * telling anyone that something happened. They are an aside.
 *
 * His own mark replaces the status icon rather than sitting beside it, because
 * these are not the app giving advice about itself. The body opens on
 * `Collapse`, which measures and animates its own height.
 *
 * Square, because the app is: `rounded-xl` is PanelUI's default, not Citadel
 * Frame's.
 *
 * Copy lives in `NOTE_HINTS`, not here: this is how a tip looks, that is what
 * each one says.
 */
/** Constant, so the body's position is not a new object on every render. */
const BODY_POSITION = { position: 'absolute', left: 0, right: 0, top: 0 } as const;

export function FieldHint({ children }: { children: string }) {
  const [mutedForeground, primary] = useCSSVariable([
    '--color-muted-foreground',
    '--color-primary',
  ]);
  const muted = asColor(mutedForeground);
  // His mark is gold wherever it appears. The chevron beside it is not his, so
  // it stays muted and the row has one thing in it that reads as him.
  const gold = asColor(primary);
  const [open, setOpen] = React.useState(false);
  const { progress, height, onLayout } = useCollapseHeight(open);
  const bodyStyle = useAnimatedStyle(() => ({ height: progress.value * height.value }));

  return (
    // The whole tip is the target, not just the chevron. Collapsed it is a
    // single short row, and a row that small with only its trailing glyph
    // pressable is a row you miss.
    <Touchable
      onPress={() => setOpen((was) => !was)}
      haptic="select"
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={open ? 'Hide Samwell tip' : 'Show Samwell tip'}
      accessibilityHint={open ? undefined : children}
    >
      <Alert className="rounded-none">
        <Alert.Indicator>
          <ZodiacPisces size={16} color={gold} strokeWidth={2} />
        </Alert.Indicator>
        <Alert.Content>
          <View className="flex-row items-center justify-between gap-2">
            <Alert.Title>
              {/* His name in gold here as everywhere else; "tip!" is not part
                  of the name, so it stays the title's own colour. */}
              <ThemedText type="labelMd" color={gold}>
                Samwell
              </ThemedText>
              {' tip!'}
            </Alert.Title>
            {open ? (
              <ChevronUp size={15} color={muted} strokeWidth={2} />
            ) : (
              <ChevronDown size={15} color={muted} strokeWidth={2} />
            )}
          </View>
          {/* Measured once and animated since — see `useCollapseHeight` for
              why this is not PanelUI's `Collapse`, which took its first
              measurement mid-animation and made the first expand jump. */}
          <Animated.View style={bodyStyle} className="overflow-hidden">
            {/* The top padding belongs to the body, not the gap above it: an
                `Alert.Content` gap would space the closed row away from a
                title it is sitting under. */}
            <Alert.Description
              onLayout={onLayout}
              style={BODY_POSITION}
              className="pt-1"
            >
              {children}
            </Alert.Description>
          </Animated.View>
        </Alert.Content>
      </Alert>
    </Touchable>
  );
}
