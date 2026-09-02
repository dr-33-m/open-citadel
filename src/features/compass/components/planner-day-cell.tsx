import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import type { DayStatus } from '@/features/compass/utils/planner-entries';
import { asColor } from '@/utils/colors';

type PlannerDayCellProps = {
  dayNumber: number;
  /** One per activity that day, in the order they fall. */
  statuses: DayStatus[];
  isToday: boolean;
  isSelected: boolean;
  isInMonth: boolean;
  onPress: () => void;
};

/** Past three, the dots stop counting and start being texture. */
const MAX_DOTS = 6;

/**
 * Day marks are SQUARE, like everything else in this app.
 *
 * They were specified as circles, and that turned out to be undeliverable on
 * this stack: on RN 0.86 / Fabric / Android a view with a background colour
 * ignores `borderRadius` while an identically-radiused stroked one honours it,
 * so the today ring drew as a circle and the selected fill drew as a square
 * from the same line of code. Tried `rounded-full` (resolves against a radius
 * scale that is 0 everywhere here), an explicit large radius, half-the-box, and
 * a fill carrying a matching ring; the fill stayed square through all of them.
 *
 * Rather than ship two shapes that disagree, the mark follows the house rule.
 * Square is what the rest of Citadel Frame is, it renders identically filled or
 * stroked, and the exception was never worth an inconsistency.
 */
const MARK_SIZE = 28;
const DOT_SIZE = 4;

/**
 * One day in the planner, drawn by hand.
 *
 * PanelUI's own cell draws a single dot for the whole day, coloured by the
 * first entry's category — enough to say "something is here", but this planner
 * is asked a harder question: how much was expected, and how much of it
 * actually happened. So the day carries one dot per activity, wrapping onto a
 * second row, and the colours are the answer.
 *
 * Today is a hairline gold ring and the selected day is a gold fill. They have
 * to be tellable apart at a glance, because there is only one gold.
 */
export function PlannerDayCell({
  dayNumber,
  statuses,
  isToday,
  isSelected,
  isInMonth,
  onPress,
}: PlannerDayCellProps) {
  const [primary, primaryForeground, destructive, foreground, mutedForeground, border] =
    useCSSVariable([
      '--color-primary',
      '--color-primary-foreground',
      '--color-destructive',
      '--color-foreground',
      '--color-muted-foreground',
      '--color-border',
    ]);

  const dotColor: Record<DayStatus, string | undefined> = {
    done: asColor(primary),
    missed: asColor(destructive),
    expected: asColor(border),
  };

  const numberColor = isSelected
    ? asColor(primaryForeground)
    : isInMonth
      ? asColor(foreground)
      : asColor(mutedForeground);

  const shown = statuses.slice(0, MAX_DOTS);

  return (
    <Touchable
      className="flex-1 items-center gap-1 py-1"
      onPress={onPress}
      haptic="select"
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`${dayNumber}${isToday ? ', today' : ''}, ${
        statuses.length === 0 ? 'nothing scheduled' : `${statuses.length} activities`
      }`}
    >
      <View
        style={[
          {
            width: MARK_SIZE,
            height: MARK_SIZE,
            alignItems: 'center',
            justifyContent: 'center',
          },
          isSelected
            ? { backgroundColor: asColor(primary) }
            : isToday
              ? { borderWidth: 1, borderColor: asColor(primary) }
              : null,
        ]}
      >
        <ThemedText type="bodySm" color={numberColor}>
          {String(dayNumber)}
        </ThemedText>
      </View>

      {/* Wraps to a second row rather than growing the cell: the grid is six
          weeks tall whatever month it shows, and a day that suddenly needs
          more height would move every day under it. */}
      <View className="h-3.5 flex-row flex-wrap items-center justify-center gap-0.5">
        {shown.map((status, i) => (
          <View
            key={i}
            style={{
              width: DOT_SIZE,
              height: DOT_SIZE,
              backgroundColor: dotColor[status],
            }}
          />
        ))}
      </View>
    </Touchable>
  );
}
