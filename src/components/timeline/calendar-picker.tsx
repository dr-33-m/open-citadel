import { like } from 'drizzle-orm';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { useColors } from '@/hooks/use-colors';
import { spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { highlights, thoughts } from '@/db/schema';

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
  const colors = useColors();
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

  // Activity counts per day for the current view month: { 'YYYY-MM-DD': count }
  const [activityCounts, setActivityCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!legacyMode) return; // activity dots only in timeline mode
    const monthStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
    const prefix = `${monthStr}%`;

    Promise.all([
      db.select({ createdAt: highlights.createdAt }).from(highlights).where(like(highlights.createdAt, prefix)),
      db.select({ createdAt: thoughts.createdAt }).from(thoughts).where(like(thoughts.createdAt, prefix)),
    ]).then(([hRows, tRows]) => {
      const counts: Record<string, number> = {};
      [...hRows, ...tRows].forEach(({ createdAt }) => {
        const day = createdAt.split('T')[0];
        counts[day] = (counts[day] ?? 0) + 1;
      });
      setActivityCounts(counts);
    }).catch(() => {});
  }, [viewYear, viewMonth]);

  const styles = React.useMemo(() => StyleSheet.create({
    container: { flex: 1, justifyContent: 'flex-end' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: {
      backgroundColor: colors.surface.low,
      paddingHorizontal: spacing[6],
      paddingTop: spacing[4],
      paddingBottom: spacing[10],
    },
    handle: {
      width: 40,
      height: 4,
      backgroundColor: colors.surface.highest,
      alignSelf: 'center',
      marginBottom: spacing[4],
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing[4],
    },
    navBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    weekRow: {
      flexDirection: 'row',
      marginBottom: spacing[2],
    },
    weekCell: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing[2],
    },
    gridRow: {
      flexDirection: 'row',
    },
    dayCell: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing[2],
    },
    daySelected: {
      borderRadius: 20,
    },
    dayToday: {
      borderWidth: 1,
      borderRadius: 20,
    },
    activityDot: {
      width: 3,
      height: 3,
      borderRadius: 2,
      marginTop: 2,
    },
  }), [colors]);

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

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <Touchable style={styles.overlay} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Touchable onPress={prevMonth} style={styles.navBtn}>
              <ChevronLeft size={20} color={colors.text.primary} />
            </Touchable>
            <ThemedText type="bodyMd">{monthName}</ThemedText>
            <Touchable onPress={nextMonth} style={styles.navBtn}>
              <ChevronRight size={20} color={colors.text.primary} />
            </Touchable>
          </View>

          {/* Week header */}
          <View style={styles.weekRow}>
            {DAYS.map((d, i) => (
              <View key={i} style={styles.weekCell}>
                <ThemedText type="labelSm" color={colors.text.secondary}>
                  {d}
                </ThemedText>
              </View>
            ))}
          </View>

          {/* Calendar grid */}
          {rows.map((row, ri) => (
            <View key={ri} style={styles.gridRow}>
              {row.map((day, ci) => {
                if (day === null) {
                  return <View key={ci} style={styles.dayCell} />;
                }
                const dateStr = toDateString(viewYear, viewMonth, day);
                const isSelected = dateStr === selectedDate;
                const isToday = dateStr === today;
                // Disabled if outside the bounds; in legacy (timeline) mode, no future.
                const isDisabled =
                  (minDate ? dateStr < minDate : false) ||
                  (maxDate ? dateStr > maxDate : false) ||
                  (legacyMode ? dateStr > today : false);
                const count = activityCounts[dateStr] ?? 0;
                const dotOpacity = count === 0 ? 1 : Math.max(0.2, Math.min(count / 10, 1));
                const dotColor = count === 0 ? '#e53935' : colors.primary.default;

                return (
                  <Touchable
                    key={ci}
                    style={[
                      styles.dayCell,
                      isSelected && [
                        styles.daySelected,
                        { backgroundColor: colors.primary.default },
                      ],
                      isToday && !isSelected && [
                        styles.dayToday,
                        { borderColor: colors.primary.default },
                      ],
                    ]}
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
                          ? colors.text.inverse
                          : isDisabled
                            ? colors.surface.highest
                            : colors.text.primary
                      }
                    >
                      {day}
                    </ThemedText>
                    {legacyMode && dateStr < today && (
                      <View
                        style={[
                          styles.activityDot,
                          { backgroundColor: dotColor, opacity: dotOpacity },
                        ]}
                      />
                    )}
                  </Touchable>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </Modal>
  );
}
