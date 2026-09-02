import React from 'react';
import { View } from 'react-native';

import { Calendar } from '@/components/ui/calendar';
import { Card } from '@/components/ui/card';
import { Sheet } from '@/components/ui/sheet';
import { db } from '@/db/client';
import { readingDays } from '@/db/schema';
import { didReadOn, readingDotStrength } from '@/services/reading-day';
import { isValidYmd, localDayString, parseYmd, type Ymd } from '@/utils/day';

type CalendarPickerProps = {
  visible: boolean;
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
  onClose: () => void;
  /** Earliest selectable day (YYYY-MM-DD). Enables future selection (e.g. a target date). */
  minDate?: string;
  /** Latest selectable day (YYYY-MM-DD). */
  maxDate?: string;
};

/** `Ymd` -> the local midnight `Calendar` works in. */
function toDate(ymd: string | undefined): Date | undefined {
  if (!ymd || !isValidYmd(ymd)) return undefined;
  const { year, month, day } = parseYmd(ymd);
  return new Date(year, month - 1, day);
}

/** `Calendar` hands back a local `Date`; the app stores days as `Ymd`. */
function toYmd(date: Date): Ymd {
  return localDayString(date);
}

/**
 * Pick a day.
 *
 * The grid, the paging, the six-row height and the accessibility all come from
 * PanelUI's `Calendar`. This file is the app's part: which days may be picked,
 * and how much was read on each of them.
 *
 * It used to be a month grid of its own — a second calendar in an app that
 * already vendored one, disagreeing with it about the day mark and rebuilding
 * forty-two cells on every render of the screen around it. Measured on an A33,
 * that cost 364ms at Timeline mount for a sheet nobody had opened yet.
 */
export const CalendarPicker = React.memo(function CalendarPicker({
  visible,
  selectedDate,
  onSelectDate,
  onClose,
  minDate,
  maxDate,
}: CalendarPickerProps) {
  const today = localDayString();

  // "Legacy" (timeline) mode = no bounds passed: activity dots on, no future.
  const legacyMode = !minDate && !maxDate;

  const selected = React.useMemo(() => toDate(selectedDate), [selectedDate]);
  const min = React.useMemo(() => toDate(minDate), [minDate]);
  const max = React.useMemo(
    () => toDate(maxDate) ?? (legacyMode ? toDate(today) : undefined),
    [maxDate, legacyMode, today],
  );

  /*
   * The month on show. Held here rather than left to `Calendar`'s own state so
   * that reopening the sheet on a different date lands on that date's month —
   * the picker stays mounted for the life of the screen, so without this every
   * open after the first showed whatever month was last paged to.
   */
  const [month, setMonth] = React.useState<Date>(() => toDate(selectedDate) ?? new Date());
  const wasVisible = React.useRef(visible);
  React.useEffect(() => {
    if (visible && !wasVisible.current) setMonth(toDate(selectedDate) ?? new Date());
    wasVisible.current = visible;
  }, [visible, selectedDate]);

  /*
   * How much was read on every day there is, as a fraction of a book:
   * { 'YYYY-MM-DD': 0.037 }. Summed across books, so an hour split between two
   * of them still reads as one solid day.
   *
   * The whole history at once, not the month on show. Per month it read well —
   * one small indexed query — but it made the map change identity every time
   * the month did, which gave `renderDayAccessory` a new identity, which
   * rendered all forty-two cells a second time to draw exactly what they had
   * just drawn. Measured on an A33: two grid renders per month switch, about
   * 400ms, of which the computation inside them was 8ms. The rest was React
   * and Fabric moving ~170 views twice.
   *
   * One row per book per day actually read, so this is tens to hundreds of
   * rows for a real library — fewer than a single month of cells.
   */
  const [readingByDay, setReadingByDay] = React.useState<Record<string, number>>({});

  // Re-read when the sheet opens rather than on every month, so a day read
  // since the last open still shows up.
  React.useEffect(() => {
    if (!legacyMode || !visible) return; // activity dots only in timeline mode
    db.select({ day: readingDays.day, progressDelta: readingDays.progressDelta })
      .from(readingDays)
      .then((rows) => {
        const totals: Record<string, number> = {};
        rows.forEach(({ day, progressDelta }) => {
          totals[day] = (totals[day] ?? 0) + progressDelta;
        });
        setReadingByDay(totals);
      })
      .catch(() => {});
  }, [visible, legacyMode]);

  const handleSelect = React.useCallback(
    (date: Date | undefined) => {
      if (!date) return;
      onSelectDate(toYmd(date));
      onClose();
    },
    [onSelectDate, onClose],
  );

  /*
   * The mark under a day: gold for a day that was read, destructive for one
   * that was not, fading with how much. Only past days carry one — an unlived
   * day has nothing to report, and marking it red would be an accusation.
   */
  const renderDayAccessory = React.useCallback(
    (date: Date) => {
      const ymd = toYmd(date);
      if (ymd >= today) return null;
      const read = readingByDay[ymd] ?? 0;
      return (
        <View
          className={didReadOn(read) ? 'h-[3px] w-[3px] bg-primary' : 'h-[3px] w-[3px] bg-destructive'}
          style={{ opacity: readingDotStrength(read) }}
        />
      );
    },
    [readingByDay, today],
  );

  return (
    <Sheet visible={visible} onClose={onClose}>
      {/* The month sits in a card, like the Compass planner's does: a calendar
          is a surface carrying content, not a bare block of the sheet. The
          calendar's own panel is off because this is it. */}
      <View className="px-4">
        <Card className="p-4">
          <Calendar
            mode="single"
            bordered={false}
            selected={selected}
            onSelect={handleSelect}
            month={month}
            onMonthChange={setMonth}
            minDate={min}
            maxDate={max}
            renderDayAccessory={legacyMode ? renderDayAccessory : undefined}
          />
        </Card>
      </View>
    </Sheet>
  );
});
