import { eq } from 'drizzle-orm';
import { useRouter } from 'expo-router';
import { Calendar, MessageSquare, Pencil, Trash2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import { db } from '@/db/client';
import { highlights, thoughts } from '@/db/schema';
import { fetchAllTags } from '@/stores/reader';
import { formatDateLabel, useTimelineStore, type TimelineItem } from '@/stores/timeline';
import { useChatStore } from '@/stores/chat';


export default function TimelineScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { groups, selectedDate, loadTimeline, setSelectedDate, addThought, updateThought, deleteThought, deleteHighlight } = useTimelineStore();
  const createChatSession = useChatStore((s) => s.createSession);

  const [showCalendar, setShowCalendar] = useState(false);
  const [showThoughtSheet, setShowThoughtSheet] = useState(false);
  const [editingThought, setEditingThought] = useState<ThoughtEditData | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [longPressEntry, setLongPressEntry] = useState<TimelineItem | null>(null);

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

  const handleEntryPress = (entry: TimelineItem) => {
    if (entry.type === 'thought') {
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

  const handleStartChat = async (entry: TimelineItem) => {
    setLongPressEntry(null);
    const sessionId = await createChatSession({
      bookId: entry.bookId || undefined,
      title: entry.highlightText.slice(0, 60),
      contextText: entry.highlightText,
      contextLocator: entry.highlightLocator ?? undefined,
    });
    // Link the chat back to the entry so it shows View Chat next time
    if (entry.type === 'highlight') {
      await db.update(highlights).set({ chatSessionId: sessionId }).where(eq(highlights.id, entry.id));
    } else if (entry.type === 'thought') {
      await db.update(thoughts).set({ chatSessionId: sessionId }).where(eq(thoughts.id, entry.id));
    }
    await loadTimeline();
    router.push({ pathname: '/chat/[id]', params: { id: sessionId } } as any);
  };

  const handleViewChat = (entry: TimelineItem) => {
    setLongPressEntry(null);
    if (entry.chatSessionId) {
      router.push({ pathname: '/chat/[id]', params: { id: entry.chatSessionId } } as any);
    }
  };

  const handleDeleteEntry = async (entry: TimelineItem) => {
    setLongPressEntry(null);
    if (entry.type === 'thought') {
      await deleteThought(entry.id);
    } else if (entry.type === 'highlight') {
      await deleteHighlight(entry.id);
    }
  };

  const hasEntries = groups.length > 0 && groups[0].entries.length > 0;

  const sheetStyles = React.useMemo(() => StyleSheet.create({
    sheet: {
      backgroundColor: colors.surface.low,
      paddingHorizontal: spacing[6],
      paddingTop: spacing[4],
      gap: spacing[1],
    },
    sheetHandle: {
      width: 40,
      height: 4,
      backgroundColor: colors.surface.highest,
      alignSelf: 'center' as const,
      marginBottom: spacing[3],
    },
    sheetRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing[4],
      paddingVertical: spacing[4],
    },
    sheetSeparator: {
      height: 1,
      backgroundColor: colors.outline.variant,
    },
  }), [colors]);

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
              onLongPress={() => setLongPressEntry(entry)}
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

      {/* Entry long-press action sheet */}
      <Modal
        visible={longPressEntry !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setLongPressEntry(null)}
      >
        <View style={styles.sheetContainer}>
          <Pressable style={styles.sheetOverlay} onPress={() => setLongPressEntry(null)} />
          <View style={[sheetStyles.sheet, { paddingBottom: insets.bottom + spacing[4] }]}>
            <View style={sheetStyles.sheetHandle} />

            {longPressEntry && (
              <ThemedText
                type="bodySm"
                color={colors.text.secondary}
                numberOfLines={2}
                style={styles.sheetTitle}
              >
                {longPressEntry.highlightText}
              </ThemedText>
            )}

            {/* Edit — only for thoughts */}
            {longPressEntry?.type === 'thought' && (
              <>
                <Pressable
                  style={sheetStyles.sheetRow}
                  onPress={() => {
                    setLongPressEntry(null);
                    setEditingThought({
                      id: longPressEntry.id,
                      text: longPressEntry.highlightText,
                      color: longPressEntry.colorIndicator,
                      tags: longPressEntry.tags,
                    });
                    setShowThoughtSheet(true);
                  }}
                >
                  <Pencil size={20} color={colors.text.primary} />
                  <ThemedText type="bodyMd" color={colors.text.primary}>Edit</ThemedText>
                </Pressable>
                <View style={sheetStyles.sheetSeparator} />
              </>
            )}

            {/* View Chat — if linked */}
            {longPressEntry?.chatSessionId ? (
              <>
                <Pressable style={sheetStyles.sheetRow} onPress={() => handleViewChat(longPressEntry)}>
                  <MessageSquare size={20} color={colors.text.primary} />
                  <ThemedText type="bodyMd" color={colors.text.primary}>View Chat</ThemedText>
                </Pressable>
                <View style={sheetStyles.sheetSeparator} />
              </>
            ) : (
              <>
                <Pressable style={sheetStyles.sheetRow} onPress={() => longPressEntry && handleStartChat(longPressEntry)}>
                  <MessageSquare size={20} color={colors.text.primary} />
                  <ThemedText type="bodyMd" color={colors.text.primary}>Start Chat</ThemedText>
                </Pressable>
                <View style={sheetStyles.sheetSeparator} />
              </>
            )}

            {/* Delete */}
            <Pressable
              style={sheetStyles.sheetRow}
              onPress={() => longPressEntry && handleDeleteEntry(longPressEntry)}
            >
              <Trash2 size={20} color={colors.text.secondary} />
              <ThemedText type="bodyMd" color={colors.text.secondary}>Delete</ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  sheetContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetTitle: {
    marginBottom: spacing[3],
  },
});
