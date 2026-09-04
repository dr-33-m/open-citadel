import React from 'react';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { DayStatus } from '@/features/compass/utils/planner-entries';
import type { Ymd } from '@/utils/day';
import { haptics } from '@/utils/haptics';

/**
 * Every colour a day can draw, resolved once for the whole month.
 *
 * The cell used to read six CSS variables itself, which is 252 reads for a
 * grid — and the grid redraws whenever the month does. The month is one theme,
 * so the reads belong where there is one of them.
 */
export type PlannerDayColors = {
  dot: Record<DayStatus, string | undefined>;
  /** The gold the today ring and the selected fill are both drawn in. */
  mark: string | undefined;
  /** The number's colour on a selected day, inside the month, and outside it. */
  onMark: string | undefined;
  inMonth: string | undefined;
  outOfMonth: string | undefined;
};

type PlannerDayCellProps = {
  day: Ymd;
  dayNumber: number;
  /** One per activity that day, in the order they fall. */
  statuses: DayStatus[];
  isToday: boolean;
  isSelected: boolean;
  isInMonth: boolean;
  colors: PlannerDayColors;
  /** Takes the day rather than closing over it, so the callback is one object
   *  for the whole grid and the memo below actually holds. */
  onPress: (day: Ymd) => void;
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

const MARK_BOX = {
  width: MARK_SIZE,
  height: MARK_SIZE,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

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
 *
 * A plain `Pressable`, not the app's `Touchable`. `Touchable` animates its own
 * press on the UI thread, which is the right default for a button and the
 * wrong one for forty-two of them in a grid — that is a shared value and an
 * animated style per day, the same one-node-per-element trap the skeleton bars
 * were. A day already answers a press by filling in.
 *
 * Memoized, and its props are all primitives or held identities, so the
 * transcript streaming behind an open planner redraws none of this and opening
 * a day redraws two cells rather than the month.
 */
export const PlannerDayCell = React.memo(function PlannerDayCell({
  day,
  dayNumber,
  statuses,
  isToday,
  isSelected,
  isInMonth,
  colors,
  onPress,
}: PlannerDayCellProps) {
  const numberColor = isSelected
    ? colors.onMark
    : isInMonth
      ? colors.inMonth
      : colors.outOfMonth;

  const shown = statuses.length > MAX_DOTS ? statuses.slice(0, MAX_DOTS) : statuses;

  const press = () => {
    haptics.select();
    onPress(day);
  };

  return (
    <Pressable
      className="flex-1 items-center gap-1 py-1"
      onPress={press}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`${dayNumber}${isToday ? ', today' : ''}, ${
        statuses.length === 0 ? 'nothing scheduled' : `${statuses.length} activities`
      }`}
    >
      <View
        style={[
          MARK_BOX,
          isSelected
            ? { backgroundColor: colors.mark }
            : isToday
              ? { borderWidth: 1, borderColor: colors.mark }
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
              backgroundColor: colors.dot[status],
            }}
          />
        ))}
      </View>
    </Pressable>
  );
});
