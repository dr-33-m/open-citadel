import { like } from 'drizzle-orm';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';
import { cn } from '@/lib/cn';
import { db } from '@/db/client';
import { readingDays } from '@/db/schema';
import { didReadOn, readingDotStrength } from '@/services/reading-day';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

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

/** ThemedText/lucide icons take a literal color, not a className — resolve the
 * semantic token once per render and fall back to `undefined` (which lets
 * `ThemedText` apply its own default) if it hasn't resolved yet. */
function asColor(value: string | number | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function toDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function todayString(): string {
  const d = new Date();
  return toDateString(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseMonth(ymd: string | undefined): { year: number; month: number } | null {
  if (!ymd) return null;
  const [y, m] = ymd.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return { year: y, month: m - 1 };
}

export function CalendarPicker({
  visible,
  selectedDate,
  onSelectDate,
  onClose,
  minDate,
  maxDate,
}: CalendarPickerProps) {
  const [foreground, mutedForeground, primary, primaryForeground, destructive, border] =
    useCSSVariable([
      '--color-foreground',
      '--color-muted-foreground',
      '--color-primary',
      '--color-primary-foreground',
      '--color-destructive',
      '--color-border',
    ]);
  const today = todayString();

  // "Legacy" (timeline) mode = no bounds passed: activity dots on, no future.
  const legacyMode = !minDate && !maxDate;

  // Open on the selected month, else the min-date month, else the current month
  // (guards against an empty/invalid selectedDate, which used to render "Invalid Date").
  const initialMonth =
    parseMonth(selectedDate) ??
    parseMonth(minDate) ??
    (() => {
      const d = new Date();
      return { year: d.getFullYear(), month: d.getMonth() };
    })();
  const [viewYear, setViewYear] = useState(initialMonth.year);
  const [viewMonth, setViewMonth] = useState(initialMonth.month);

  /*
   * `initialMonth` is recomputed every render but only ever read by `useState`
   * on the first one, and this picker is mounted for the life of the screen
   * with `visible` toggling — so every open after the first showed whatever
   * month was last paged to, not the month of the date being edited. Re-sync
   * on the way in, which is also the only moment it can be done without
   * fighting the user's own paging.
   */
  const wasVisible = useRef(visible);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      setViewYear(initialMonth.year);
      setViewMonth(initialMonth.month);
    }
    wasVisible.current = visible;
  }, [visible, initialMonth.year, initialMonth.month]);

  // How much was actually read per day this month, as a fraction of a book:
  // { 'YYYY-MM-DD': 0.037 }. Summed across books, so an hour split between two
  // of them still reads as one solid day.
  const [readingByDay, setReadingByDay] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!legacyMode) return; // activity dots only in timeline mode
    const monthStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;

    db.select({ day: readingDays.day, progressDelta: readingDays.progressDelta })
      .from(readingDays)
      .where(like(readingDays.day, `${monthStr}%`))
      .then((rows) => {
        const totals: Record<string, number> = {};
        rows.forEach(({ day, progressDelta }) => {
          totals[day] = (totals[day] ?? 0) + progressDelta;
        });
        setReadingByDay(totals);
      })
      .catch(() => {});
  }, [viewYear, viewMonth, legacyMode]);

  const monthName = new Date(viewYear, viewMonth).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  // Build the calendar grid
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  /*
   * Always six rows, padded, never five.
   *
   * A month needs five or six depending on where its first day falls, and the
   * sheet around this grid is auto-height — so paging between months, or
   * reopening on a different one, changed the sheet's measured content height
   * by a whole row and made it re-measure and re-snap mid-animation. A
   * constant 42 cells means the sheet is the same height for every month and
   * has nothing to re-snap to. The trailing blanks cost one row of empty
   * space in the short months, which is what every calendar that does not
   * jump does.
   */
  const GRID_CELLS = 42;
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length < GRID_CELLS) cells.push(null);

  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      {/* The month sits in a card, like the Compass planner's does: a calendar
          is a surface carrying content, not a bare block of the sheet. */}
      <View className="px-4">
        <Card className="p-4">
        <View className="mb-4 flex-row items-center justify-between">
          <Touchable onPress={prevMonth} className="h-9 w-9 items-center justify-center" hitSlop={4}>
            <ChevronLeft size={20} color={asColor(foreground)} />
          </Touchable>
          <ThemedText type="bodyMd">{monthName}</ThemedText>
          <Touchable onPress={nextMonth} className="h-9 w-9 items-center justify-center" hitSlop={4}>
            <ChevronRight size={20} color={asColor(foreground)} />
          </Touchable>
        </View>

        {/* Week header */}
        <View className="mb-2 flex-row">
          {DAYS.map((d, i) => (
            <View key={i} className="flex-1 items-center py-3">
              <ThemedText type="labelSm" color={asColor(mutedForeground)}>
                {d}
              </ThemedText>
            </View>
          ))}
        </View>

        {/* Calendar grid */}
        {rows.map((row, ri) => (
          <View key={ri} className="flex-row">
            {row.map((day, ci) => {
              if (day === null) {
                return <View key={ci} className="flex-1 items-center justify-center py-3" />;
              }
              const dateStr = toDateString(viewYear, viewMonth, day);
              const isSelected = dateStr === selectedDate;
              const isToday = dateStr === today;
              // Disabled if outside the bounds; in legacy (timeline) mode, no future.
              const isDisabled =
                (minDate ? dateStr < minDate : false) ||
                (maxDate ? dateStr > maxDate : false) ||
                (legacyMode ? dateStr > today : false);
              const read = readingByDay[dateStr] ?? 0;
              const dotOpacity = readingDotStrength(read);
              const dotColor = didReadOn(read) ? primary : destructive;

              return (
                <Touchable
                  key={ci}
                  className={cn(
                    'flex-1 items-center justify-center py-3',
                    // Square, like the Compass planner's day marks. On RN 0.86
                    // / Fabric a filled view ignores `borderRadius` while a
                    // stroked one honours it, so a round selected day and a
                    // round today ring could not be made to agree — and two
                    // calendars in one app must not disagree about what a day
                    // looks like.
                    isSelected && 'bg-primary',
                    isToday && !isSelected && 'border border-primary',
                  )}
                  onPress={() => {
                    if (!isDisabled) {
                      onSelectDate(dateStr);
                      onClose();
                    }
                  }}
                  disabled={isDisabled}
                >
                  <ThemedText
                    type="bodySm"
                    color={
                      isSelected
                        ? asColor(primaryForeground)
                        : isDisabled
                          ? asColor(border)
                          : asColor(foreground)
                    }
                  >
                    {day}
                  </ThemedText>
                  {legacyMode && dateStr < today && (
                    <View
                      className="mt-1 h-[3px] w-[3px]"
                      style={{ backgroundColor: asColor(dotColor), opacity: dotOpacity }}
                    />
                  )}
                </Touchable>
              );
            })}
          </View>
        ))}
        </Card>
      </View>
    </Sheet>
  );
}
