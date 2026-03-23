import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useColors } from '@/hooks/use-colors';
import { spacing } from '@/constants/theme';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type CalendarPickerProps = {
  visible: boolean;
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
  onClose: () => void;
};

function toDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function todayString(): string {
  const d = new Date();
  return toDateString(d.getFullYear(), d.getMonth(), d.getDate());
}

export function CalendarPicker({
  visible,
  selectedDate,
  onSelectDate,
  onClose,
}: CalendarPickerProps) {
  const colors = useColors();
  const today = todayString();

  // Parse selectedDate to initialize the view month
  const [viewYear, setViewYear] = useState(() => {
    const [y] = selectedDate.split('-').map(Number);
    return y;
  });
  const [viewMonth, setViewMonth] = useState(() => {
    const [, m] = selectedDate.split('-').map(Number);
    return m - 1; // 0-indexed
  });

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
      paddingVertical: spacing[3],
    },
    daySelected: {
      borderRadius: 20,
    },
    dayToday: {
      borderWidth: 1,
      borderRadius: 20,
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
        <Pressable style={styles.overlay} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Pressable onPress={prevMonth} style={styles.navBtn}>
              <ChevronLeft size={20} color={colors.text.primary} />
            </Pressable>
            <ThemedText type="bodyMd">{monthName}</ThemedText>
            <Pressable onPress={nextMonth} style={styles.navBtn}>
              <ChevronRight size={20} color={colors.text.primary} />
            </Pressable>
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
                const isFuture = dateStr > today;

                return (
                  <Pressable
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
                      if (!isFuture) {
                        onSelectDate(dateStr);
                        onClose();
                      }
                    }}
                    disabled={isFuture}
                  >
                    <ThemedText
                      type="bodySm"
                      color={
                        isSelected
                          ? colors.text.inverse
                          : isFuture
                            ? colors.surface.highest
                            : colors.text.primary
                      }
                    >
                      {day}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </Modal>
  );
}
