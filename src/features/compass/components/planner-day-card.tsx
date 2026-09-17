import React from 'react';
// Core's ScrollView, not Gesture Handler's. The card sits inside the carousel's
// pan, and Gesture Handler's scroller claimed every touch on the list, so a
// horizontal swipe over the activities stopped changing the day. Core's native
// scroller only takes a vertical drag, which the pan gives up on anyway
// (`failOffsetY`), so each gesture goes to the one it belongs to.
import { ScrollView, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { PageFade } from '@/components/scroll-fades';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { spacing } from '@/constants/theme';
import { byTimeThenTitle, type PlannerCell } from '@/features/compass/utils/planner-entries';
import { asColor } from '@/utils/colors';
import { parseYmd, type Ymd } from '@/utils/day';

type PlannerDayCardProps = {
  date: Ymd;
  cells: PlannerCell[];
  isToday: boolean;
  /** Every card in the run is the same size, so the swipe reads as one deck. */
  width: number;
  height: number;
};

const STATUS_LABEL: Record<PlannerCell['status'], string> = {
  done: 'DONE',
  missed: 'MISSED',
  expected: 'DUE',
  flexible: 'ANY DAY',
};

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * The list's own padding, in place of the card's at the bottom, so the last
 * activity can scroll clear of the fade instead of resting underneath it.
 */
const LIST_STYLE = { gap: spacing[3], paddingBottom: spacing[5] } as const;

/**
 * One day, and what was on it.
 *
 * The number leads at display size with the weekday beside it, because when
 * this card is swiped the day is the thing that changed and it has to be
 * readable without hunting for it.
 *
 * Ordered by time, with untimed activities at the bottom: a time here is a
 * shape for the day, not a deadline, so an untimed activity is not late, it
 * just has no place in the order.
 *
 * The card is a fixed size and a day across five goals can hold more than fits,
 * so the activities scroll inside it under the header. Letting them grow past
 * the card drew them over the month behind it.
 */
export function PlannerDayCard({
  date,
  cells,
  isToday,
  width,
  height,
}: PlannerDayCardProps) {
  const [primary, destructive, mutedForeground] = useCSSVariable([
    '--color-primary',
    '--color-destructive',
    '--color-muted-foreground',
  ]);
  const muted = asColor(mutedForeground);

  const statusColor: Record<PlannerCell['status'], string | undefined> = {
    done: asColor(primary),
    missed: asColor(destructive),
    expected: muted,
    flexible: muted,
  };

  const { year, month, day } = parseYmd(date);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];

  const ordered = React.useMemo(() => [...cells].sort(byTimeThenTitle), [cells]);
  const doneCount = ordered.filter((cell) => cell.status === 'done').length;

  return (
    <Card style={{ width, height }}>
      <Card.Content className="flex-1 gap-4 p-5 pb-0">
        <View className="flex-row items-center justify-between gap-3">
          {/* Centred, not baseline-aligned: on a baseline the display-size
              number sits level with the weekday and leaves the month hanging
              below it, so the block reads as two things rather than one. */}
          <View className="flex-row items-center gap-2">
            <ThemedText type="displayMd" color={isToday ? asColor(primary) : undefined}>
              {String(day)}
            </ThemedText>
            <View>
              <ThemedText type="headlineSm">{weekday}</ThemedText>
              <ThemedText type="labelSm" color={muted}>
                {`${MONTHS[month - 1]} ${year}`}
              </ThemedText>
            </View>
          </View>
          {ordered.length > 0 && (
            <ThemedText type="labelSm" color={muted}>
              {`${doneCount} OF ${ordered.length}`}
            </ThemedText>
          )}
        </View>

        {ordered.length === 0 ? (
          <ThemedText type="bodySm" color={muted}>
            Nothing was scheduled.
          </ThemedText>
        ) : (
          <PageFade edges="both" surface="card">
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={LIST_STYLE}
            >
              {ordered.map((cell) => (
                <View key={cell.id} className="flex-row items-start gap-3">
                  <View className="w-12 pt-0.5">
                    <ThemedText type="labelSm" color={muted}>
                      {cell.timeOfDay ?? '—'}
                    </ThemedText>
                  </View>
                  <View className="flex-1 gap-1">
                    <ThemedText type="bodyMd">{cell.title}</ThemedText>
                    <View className="flex-row flex-wrap items-center gap-x-2">
                      <ThemedText type="labelSm" color={statusColor[cell.status]}>
                        {STATUS_LABEL[cell.status]}
                      </ThemedText>
                      {cell.detail && (
                        <ThemedText type="labelSm" color={muted}>
                          {cell.detail.toUpperCase()}
                        </ThemedText>
                      )}
                    </View>
                    {cell.note && (
                      <ThemedText type="bodySm" color={muted} italic>
                        {cell.note}
                      </ThemedText>
                    )}
                  </View>
                </View>
              ))}
            </ScrollView>
          </PageFade>
        )}
      </Card.Content>
    </Card>
  );
}
