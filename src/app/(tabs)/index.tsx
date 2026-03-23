import { useRouter } from 'expo-router';
import { Clock } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TimelineEntry } from '@/components/timeline/timeline-entry';
import { Fab } from '@/components/ui/fab';
import { ScreenHeader } from '@/components/ui/screen-header';
import { colors, spacing } from '@/constants/theme';
import { useTimelineStore } from '@/stores/timeline';


export default function TimelineScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { groups, loadTimeline } = useTimelineStore();

  // Reload timeline when tab is focused
  useFocusEffect(
    useCallback(() => {
      loadTimeline();
    }, [loadTimeline])
  );

  const today = new Date();
  const day = today.getDate();
  const suffix =
    day === 1 || day === 21 || day === 31
      ? 'st'
      : day === 2 || day === 22
        ? 'nd'
        : day === 3 || day === 23
          ? 'rd'
          : 'th';
  const month = today.toLocaleDateString('en-US', { month: 'long' });
  const year = today.getFullYear();
  const dateString = `${day}${suffix} of ${month},\n${year}`;

  const handleEntryPress = (bookId: string, locator: string | null) => {
    if (locator) {
      router.push(
        `/reader/${bookId}?locator=${encodeURIComponent(locator)}` as any
      );
    } else {
      router.push(`/reader/${bookId}` as any);
    }
  };

  const hasEntries = groups.length > 0;

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="Open Citadel"
        rightIcon={<Clock size={20} color={colors.text.primary} />}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Date section */}
        <View style={styles.dateSection}>
          <ThemedText type="headlineSm" color={colors.text.secondary}>
            {dateString}
          </ThemedText>
        </View>

        {!hasEntries && (
          <View style={styles.emptyState}>
            <ThemedText
              type="bodyMd"
              color={colors.text.secondary}
              style={styles.emptyText}
            >
              Start reading and highlighting to build your archive.
            </ThemedText>
          </View>
        )}

        {/* Timeline entries grouped by day */}
        {groups.map((group) => (
          <View key={group.date}>
            {group.label !== 'Today' && (
              <View style={styles.dayHeader}>
                <ThemedText type="labelMd" color={colors.primary.default}>
                  {group.label.toUpperCase()}
                </ThemedText>
              </View>
            )}
            {group.entries.map((entry, index) => (
              <TimelineEntry
                key={entry.id}
                entry={entry}
                isLast={index === group.entries.length - 1}
                onPress={() =>
                  handleEntryPress(entry.bookId, entry.highlightLocator)
                }
              />
            ))}
          </View>
        ))}

      </ScrollView>

      <Fab />
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
  dayHeader: {
    paddingHorizontal: spacing[6],
    paddingTop: spacing[10],
    paddingBottom: spacing[2],
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
