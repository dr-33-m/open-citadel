import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Planner } from '@/components/ui/planner';
import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';
import { PlannerDayCell } from '@/features/compass/components/planner-day-cell';
import { PlannerDayDialog } from '@/features/compass/components/planner-day-dialog';
import { buildPlannerCells, type DayStatus } from '@/features/compass/utils/planner-entries';
import type { LogView, TrackableView } from '@/services/occurrences';
import { asColor } from '@/utils/colors';
import {
  endOfMonthYmd,
  localDayString,
  startOfMonthYmd,
  ymdRange,
  type Ymd,
} from '@/utils/day';

type PlannerSheetProps = {
  visible: boolean;
  onClose: () => void;
  trackables: TrackableView[];
  logsByTrackable: Map<string, LogView[]>;
};

function toDate(ymd: Ymd): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(year, month - 1, day);
}

const LEGEND: { status: DayStatus; label: string }[] = [
  { status: 'done', label: 'Done' },
  { status: 'missed', label: 'Missed' },
  { status: 'expected', label: 'Due' },
  { status: 'flexible', label: 'Any day' },
];

/**
 * The month, in full.
 *
 * No detents and nothing to scroll: the sheet sizes to the month, which is a
 * fixed six rows whatever month it shows. A calendar you have to grow or scroll
 * to see all of is one you cannot read at a glance, and glancing is the job.
 *
 * A day opens as a card OVER the month rather than instead of it, so the
 * selection stays visible while the card is swiped from day to day.
 */
export function PlannerSheet({
  visible,
  onClose,
  trackables,
  logsByTrackable,
}: PlannerSheetProps) {
  const [primary, destructive, mutedForeground, border] = useCSSVariable([
    '--color-primary',
    '--color-destructive',
    '--color-muted-foreground',
    '--color-border',
  ]);
  const muted = asColor(mutedForeground);

  const today = localDayString();
  const [month, setMonth] = React.useState(() => toDate(startOfMonthYmd(today)));
  const [openDay, setOpenDay] = React.useState<Ymd | null>(null);

  const monthAnchor = localDayString(month);
  const cells = React.useMemo(
    () => buildPlannerCells(monthAnchor, trackables, logsByTrackable, today),
    [monthAnchor, trackables, logsByTrackable, today],
  );

  const days = React.useMemo(
    () => ymdRange(startOfMonthYmd(monthAnchor), endOfMonthYmd(monthAnchor)),
    [monthAnchor],
  );

  const cellsByDay = React.useMemo(() => {
    const map = new Map<Ymd, typeof cells>();
    for (const cell of cells) {
      const list = map.get(cell.date) ?? [];
      list.push(cell);
      map.set(cell.date, list);
    }
    return map;
  }, [cells]);

  const dotColor: Record<DayStatus, string | undefined> = {
    done: asColor(primary),
    missed: asColor(destructive),
    expected: asColor(border),
    flexible: asColor(mutedForeground),
  };

  const onThisMonth = startOfMonthYmd(monthAnchor) === startOfMonthYmd(today);

  // Paging the month with a day open would leave the card showing a day the
  // grid behind it no longer displays.
  const onMonthChange = React.useCallback((next: Date) => {
    setMonth(next);
    setOpenDay(null);
  }, []);

  return (
    /* Content-sized, and it has to be. Given a fixed detent the sheet hands
       `Planner` a bounded box and its week rows collapse on top of each other
       — the grid sizes itself against what it is given rather than stating a
       height. Which also rules out `Sheet.Deferred` here: that is only sound
       in a sheet whose height is fixed. */
    <Sheet visible={visible} onClose={onClose}>
      <View className="gap-4 px-4 pb-2">
        <ThemedText type="labelSm" color={asColor(primary)}>
          PLANNER
        </ThemedText>

        <Card>
          <Card.Content className="gap-4 p-4">
            <Planner
              frame={false}
              month={month}
              onMonthChange={onMonthChange}
              selected={openDay ? toDate(openDay) : null}
              entries={[]}
            >
              <Planner.Header>
                <Planner.Title />
                {/* Ours rather than `Planner.Today`, which draws a muted
                    hairline whether or not it does anything. A control that
                    can act should look like one, so it takes the accent when
                    there is a month to come back from and goes quiet when
                    you are already on it. */}
                <Touchable
                  className={
                    onThisMonth
                      ? 'border border-border px-3 py-1 opacity-40'
                      : 'border border-primary px-3 py-1'
                  }
                  onPress={onThisMonth ? undefined : () => onMonthChange(new Date())}
                  haptic="select"
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Go to this month"
                  accessibilityState={{ disabled: onThisMonth }}
                >
                  <ThemedText
                    type="labelSm"
                    color={onThisMonth ? muted : asColor(primary)}
                  >
                    TODAY
                  </ThemedText>
                </Touchable>
                <Planner.Nav />
              </Planner.Header>
              <Planner.Grid
                renderDay={({ date, isToday, isInMonth }) => {
                  const ymd = localDayString(date);
                  return (
                    <PlannerDayCell
                      dayNumber={date.getDate()}
                      statuses={(cellsByDay.get(ymd) ?? []).map((cell) => cell.status)}
                      isToday={isToday}
                      isSelected={ymd === openDay}
                      isInMonth={isInMonth}
                      onPress={() => setOpenDay(ymd)}
                    />
                  );
                }}
              />
            </Planner>

            {/* The planner's own legend keys categories; these are statuses, so
                the legend is drawn here rather than configured there. */}
            <View className="flex-row flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3">
              {LEGEND.map(({ status, label }) => (
                <View key={status} className="flex-row items-center gap-1.5">
                  <View style={{ width: 6, height: 6, backgroundColor: dotColor[status] }} />
                  <ThemedText type="labelSm" color={muted}>
                    {label}
                  </ThemedText>
                </View>
              ))}
            </View>
          </Card.Content>
        </Card>
      </View>

      <PlannerDayDialog
        date={openDay}
        days={days}
        cellsByDay={cellsByDay}
        today={today}
        onSelect={setOpenDay}
        onClose={() => setOpenDay(null)}
      />
    </Sheet>
  );
}
