import { useRouter } from 'expo-router';
import { Calendar } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { CalendarPicker } from '@/components/timeline/calendar-picker';
import { NewThoughtSheet } from '@/components/timeline/new-thought-sheet';
import type { ThoughtEditData } from '@/components/timeline/new-thought-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TimelineEntry } from '@/components/timeline/timeline-entry';
import { Fab } from '@/components/ui/fab';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useColors } from '@/hooks/use-colors';
import { spacing } from '@/constants/theme';
import { fetchAllTags } from '@/stores/reader';
import { formatDateLabel, useTimelineStore } from '@/stores/timeline';


export default function TimelineScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { groups, selectedDate, loadTimeline, setSelectedDate, addThought, updateThought } = useTimelineStore();

  const [showCalendar, setShowCalendar] = useState(false);
  const [showThoughtSheet, setShowThoughtSheet] = useState(false);
  const [editingThought, setEditingThought] = useState<ThoughtEditData | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);

  // Reload timeline when tab is focused
  useFocusEffect(
    useCallback(() => {
      loadTimeline();
    }, [loadTimeline])
  );

  // Load shared tags when opening the thought sheet
  useEffect(() => {
    if (showThoughtSheet) {
      fetchAllTags().then(setAllTags);
    }
  }, [showThoughtSheet]);

  const dateLabel = formatDateLabel(selectedDate);
  const dateDisplay = dateLabel === 'Today' || dateLabel === 'Yesterday'
    ? dateLabel
    : dateLabel.replace(', ', ',\n');

  const handleEntryPress = (entry: typeof groups[0]['entries'][0]) => {
    if (entry.type === 'thought') {
      // Open edit sheet for thoughts
      setEditingThought({
        id: entry.id,
        text: entry.highlightText,
        color: entry.colorIndicator,
        tags: entry.tags,
      });
      setShowThoughtSheet(true);
      return;
    }
    if (!entry.bookId) return;
    if (entry.highlightLocator) {
      router.push(
        `/reader/${entry.bookId}?locator=${encodeURIComponent(entry.highlightLocator)}` as any
      );
    } else {
      router.push(`/reader/${entry.bookId}` as any);
    }
  };

  const hasEntries = groups.length > 0 && groups[0].entries.length > 0;

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="Open Citadel"
        rightIcon={<Calendar size={20} color={colors.text.primary} />}
        onRightPress={() => setShowCalendar(true)}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Date section */}
        <View style={styles.dateSection}>
          <ThemedText type="headlineSm" color={colors.text.secondary}>
            {dateDisplay}
          </ThemedText>
        </View>

        {!hasEntries && (
          <View style={styles.emptyState}>
            <ThemedText
              type="bodyMd"
              color={colors.text.secondary}
              style={styles.emptyText}
            >
              No activity on this day.
            </ThemedText>
          </View>
        )}

        {/* Timeline entries for selected day */}
        {hasEntries &&
          groups[0].entries.map((entry, index) => (
            <TimelineEntry
              key={entry.id}
              entry={entry}
              isLast={index === groups[0].entries.length - 1}
              onPress={() => handleEntryPress(entry)}
            />
          ))}
      </ScrollView>

      <Fab onPress={() => { setEditingThought(null); setShowThoughtSheet(true); }} />

      <NewThoughtSheet
        visible={showThoughtSheet}
        allTags={allTags}
        editData={editingThought}
        onSave={async (text, color, tags) => {
          if (editingThought) {
            await updateThought(editingThought.id, text, color, tags);
          } else {
            await addThought(text, color, tags);
          }
          setShowThoughtSheet(false);
          setEditingThought(null);
        }}
        onClose={() => { setShowThoughtSheet(false); setEditingThought(null); }}
      />

      <CalendarPicker
        visible={showCalendar}
        selectedDate={selectedDate}
        onSelectDate={(date) => {
          setSelectedDate(date);
          setShowCalendar(false);
        }}
        onClose={() => setShowCalendar(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing[8],
  },
  dateSection: {
    paddingHorizontal: spacing[6],
    paddingTop: spacing[8],
    gap: spacing[3],
  },
  emptyState: {
    paddingHorizontal: spacing[6],
    paddingTop: spacing[16],
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
  },
});
