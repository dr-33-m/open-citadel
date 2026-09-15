import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Planner, type PlannerEntry } from '@/components/ui/planner';
import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';
import {
  PlannerDayCell,
  type PlannerDayColors,
} from '@/features/compass/components/planner-day-cell';
import { PlannerDayDialog } from '@/features/compass/components/planner-day-dialog';
import {
  buildPlannerCells,
  type DayStatus,
  type PlannerCell,
} from '@/features/compass/utils/planner-entries';
import type { LogView, TrackableView } from '@/services/occurrences';
import { useToday } from '@/hooks/use-today';
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

/*
 * The planner carries its content in the cells it draws itself, so `Planner`
 * has no entries of its own — but a fresh `[]` per render is a new identity,
 * which rebuilds the day buckets, which rebuilds the planner's context, which
 * redraws all forty-two cells. One frozen array instead, for the same reason
 * the library keeps one for an empty day.
 */
const NO_ENTRIES: PlannerEntry[] = Object.freeze([]) as never[];
const NO_STATUSES: DayStatus[] = Object.freeze([]) as never[];

/**
 * The month, in full.
 *
 * No detents and nothing to scroll: the sheet sizes to the month, which is a
 * fixed six rows whatever month it shows. A calendar you have to grow or scroll
 * to see all of is one you cannot read at a glance, and glancing is the job.
 *
 * A day opens as a card OVER the month rather than instead of it, so the
 * selection stays visible while the card is swiped from day to day.
 *
 * ## Why so much of this is memoized
 *
 * Six weeks is 42 cells, and paging a month redraws every one of them. The
 * timeline's calendar was slow for exactly this reason and was fixed the same
 * way: hold the identities steady so the grid is rebuilt when the month
 * changes and at no other time. The sheet also stays mounted for the life of
 * the Samwell screen, which re-renders on every streamed token — so without
 * held identities an open planner redrew its month once per token of a reply
 * being written behind it.
 */
export const PlannerSheet = React.memo(function PlannerSheet({
  visible,
  onClose,
  trackables,
  logsByTrackable,
}: PlannerSheetProps) {
  const [primary, primaryForeground, destructive, foreground, mutedForeground, border] =
    useCSSVariable([
      '--color-primary',
      '--color-primary-foreground',
      '--color-destructive',
      '--color-foreground',
      '--color-muted-foreground',
      '--color-border',
    ]);
  const muted = asColor(mutedForeground);

  // State, not a bare read: the month a day is judged against has to notice
  // the date changing under it. See `useToday`.
  const today = useToday();
  const [month, setMonth] = React.useState(() => toDate(startOfMonthYmd(today)));
  const [openDay, setOpenDay] = React.useState<Ymd | null>(null);

  /*
   * Every opening starts on this month.
   *
   * The sheet stays mounted for the life of the Samwell screen, so its month
   * survives being closed: page to November, close, reopen, and you are still
   * looking at November with no memory of having gone there. The timeline's
   * calendar had the same fault and was fixed the same way. Reset on the way
   * IN rather than out, so nothing changes under the closing animation.
   */
  const [wasVisible, setWasVisible] = React.useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setMonth(toDate(startOfMonthYmd(today)));
      setOpenDay(null);
    }
  }

  /*
   * Every colour the month draws in, read once here rather than six times in
   * each of forty-two cells. That was 252 theme subscriptions per grid, and
   * the grid is rebuilt on every month.
   */
  const colors = React.useMemo<PlannerDayColors>(
    () => ({
      dot: {
        done: asColor(primary),
        missed: asColor(destructive),
        expected: asColor(border),
        flexible: asColor(mutedForeground),
      },
      mark: asColor(primary),
      onMark: asColor(primaryForeground),
      inMonth: asColor(foreground),
      outOfMonth: asColor(mutedForeground),
    }),
    [primary, primaryForeground, destructive, foreground, mutedForeground, border],
  );

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
    const map = new Map<Ymd, PlannerCell[]>();
    for (const cell of cells) {
      const list = map.get(cell.date) ?? [];
      list.push(cell);
      map.set(cell.date, list);
    }
    return map;
  }, [cells]);

  /*
   * Just the statuses, in a map the cells can be handed straight from. Derived
   * once rather than `.map`ped inside `renderDay` — that made a new array per
   * cell per render, which is exactly the prop a memoized cell cannot see past.
   */
  const statusesByDay = React.useMemo(() => {
    const map = new Map<Ymd, DayStatus[]>();
    for (const [date, list] of cellsByDay) {
      map.set(
        date,
        list.map((cell) => cell.status),
      );
    }
    return map;
  }, [cellsByDay]);

  const onThisMonth = startOfMonthYmd(monthAnchor) === startOfMonthYmd(today);

  // Paging the month with a day open would leave the card showing a day the
  // grid behind it no longer displays.
  const onMonthChange = React.useCallback((next: Date) => {
    setMonth(next);
    setOpenDay(null);
  }, []);

  const goToThisMonth = React.useCallback(
    () => onMonthChange(new Date()),
    [onMonthChange],
  );

  // The open day as `Planner` wants it. Memoized because a fresh `Date` is a
  // fresh identity, and the planner's context — and so the whole grid — turns
  // over with it.
  const selected = React.useMemo(() => (openDay ? toDate(openDay) : null), [openDay]);

  const renderDay = React.useCallback(
    ({
      date,
      isToday,
      isInMonth,
    }: {
      date: Date;
      isToday: boolean;
      isInMonth: boolean;
    }) => {
      const ymd = localDayString(date);
      return (
        <PlannerDayCell
          day={ymd}
          dayNumber={date.getDate()}
          statuses={statusesByDay.get(ymd) ?? NO_STATUSES}
          isToday={isToday}
          isSelected={ymd === openDay}
          isInMonth={isInMonth}
          colors={colors}
          onPress={setOpenDay}
        />
      );
    },
    [statusesByDay, openDay, colors],
  );

  const closeDay = React.useCallback(() => setOpenDay(null), []);

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
              selected={selected}
              entries={NO_ENTRIES}
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
                  onPress={onThisMonth ? undefined : goToThisMonth}
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
              <Planner.Grid renderDay={renderDay} />
            </Planner>

            {/* The planner's own legend keys categories; these are statuses, so
                the legend is drawn here rather than configured there. */}
            <View className="flex-row flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3">
              {LEGEND.map(({ status, label }) => (
                <View key={status} className="flex-row items-center gap-1.5">
                  <View style={{ width: 6, height: 6, backgroundColor: colors.dot[status] }} />
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
        onClose={closeDay}
      />
    </Sheet>
  );
});
