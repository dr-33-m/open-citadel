import { eq } from 'drizzle-orm';
import { useRouter } from 'expo-router';
import { ArrowRight, Calendar, MessageSquare, Pencil, Share, Trash2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from "expo-router/react-navigation";

import { DeferredBody } from '@/components/navigation/deferred-body';
import { Reveal } from '@/components/navigation/reveal';
import { CalendarPicker } from '@/components/timeline/calendar-picker';
import { ExportImageCard } from '@/components/export/export-image-card';
import { captureAndShare } from '@/utils/export-image';
import { NewThoughtSheet } from '@/components/timeline/new-thought-sheet';
import type { ThoughtEditData } from '@/components/timeline/new-thought-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TimelineEntry } from '@/components/timeline/timeline-entry';
import { EmptyState } from '@/components/ui/empty-state';
import { Fab, fabClearance } from '@/components/ui/fab';
import { Item } from '@/components/ui/item';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Sheet } from '@/components/ui/sheet';
import { iconSize, layout, MaxContentWidth } from '@/constants/theme';
import { db } from '@/db/client';
import { highlights, thoughts } from '@/db/schema';
import { fetchAllTags } from '@/stores/reader';
import { formatDateLabel, useTimelineStore, type TimelineItem } from '@/stores/timeline';
import { HUB, useHubStore } from '@/stores/hub';
import { useChatStore } from '@/stores/chat';
import { asColor } from '@/utils/colors';

export function TimelinePage() {
  const insets = useSafeAreaInsets();
  // The Library is a peer page, so returning to it is a swipe the button
  // makes on the user's behalf — never a pop, because there is no push.
  const goTo = useHubStore((s) => s.goTo);
  const router = useRouter();
  // Literal colours for consumers a className can't reach: lucide icon props
  // and ThemedText's `color` prop. `--color-foreground` is text.primary's token.
  const [foreground, mutedForeground, primary, destructive] = useCSSVariable([
    '--color-foreground',
    '--color-muted-foreground',
    '--color-primary',
    '--color-destructive',
  ]);
  // Field-by-field selectors rather than one whole-store subscription: any
  // single field change (isLoading flipping on every load, say) used to
  // re-render the entire screen.
  const groups = useTimelineStore((s) => s.groups);
  const selectedDate = useTimelineStore((s) => s.selectedDate);
  const loadTimeline = useTimelineStore((s) => s.loadTimeline);
  const setSelectedDate = useTimelineStore((s) => s.setSelectedDate);
  const addThought = useTimelineStore((s) => s.addThought);
  const updateThought = useTimelineStore((s) => s.updateThought);
  const deleteThought = useTimelineStore((s) => s.deleteThought);
  const deleteHighlight = useTimelineStore((s) => s.deleteHighlight);
  const createChatSession = useChatStore((s) => s.createSession);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showThoughtSheet, setShowThoughtSheet] = useState(false);
  const [editingThought, setEditingThought] = useState<ThoughtEditData | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  /** The entry whose action sheet is open — long-press on a row opens it. */
  const [longPressEntry, setLongPressEntry] = useState<TimelineItem | null>(null);

  // Export state
  const exportViewRef = useRef<View>(null);
  const [exportEntry, setExportEntry] = useState<TimelineItem | null>(null);
  const [showExportCard, setShowExportCard] = useState(false);

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

  // Row actions — reachable via Swipe on each entry.
  const handleEditEntry = (entry: TimelineItem) => {
    setEditingThought({
      id: entry.id,
      text: entry.highlightText,
      color: entry.colorIndicator,
      tags: entry.tags,
    });
    setShowThoughtSheet(true);
  };

  const handleStartChat = async (entry: TimelineItem) => {
    // Highlights carry the chapter text captured around them at creation, so
    // the chat sees the progression the passage was lifted from.
    let contextText = entry.highlightText;
    if (entry.type === 'highlight') {
      const row = db
        .select({ context: highlights.context })
        .from(highlights)
        .where(eq(highlights.id, entry.id))
        .get();
      if (row?.context) {
        try {
          const { before, after } = JSON.parse(row.context) as {
            before?: string;
            after?: string;
          };
          contextText = `${before ? `…${before}\n\n` : ''}[Highlighted:] ${entry.highlightText}${after ? `\n\n${after}…` : ''}`;
        } catch {
          // Bare highlight text is still a valid context.
        }
      }
    }
    const sessionId = await createChatSession({
      bookId: entry.bookId || undefined,
      title: entry.highlightText.slice(0, 60),
      contextText,
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
    if (entry.chatSessionId) {
      router.push({ pathname: '/chat/[id]', params: { id: entry.chatSessionId } } as any);
    }
  };

  const handleDeleteEntry = async (entry: TimelineItem) => {
    if (entry.type === 'thought') {
      await deleteThought(entry.id);
    } else if (entry.type === 'highlight') {
      await deleteHighlight(entry.id);
    }
  };

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = (entry: TimelineItem) => {
    setExportEntry(entry);
    setShowExportCard(true);
    setIsExporting(true);
  };

  const handleExportReady = React.useCallback(async () => {
    await captureAndShare(exportViewRef);
    setShowExportCard(false);
    setExportEntry(null);
    setIsExporting(false);
  }, []);

  const hasEntries = groups.length > 0 && groups[0].entries.length > 0;

  return (
    <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
      {/* Left is what this screen does, right is the way home — the mirror of
          the Library's header, which reaches this screen with its own left
          button. Anything that navigates sits on the side it navigates
          toward, so the two headers read as one bar across both screens. */}
      <ScreenHeader
        title="Timeline"
        leftIcon={<Calendar size={iconSize.default} color={asColor(foreground)} />}
        leftLabel="Pick a day"
        onLeftPress={() => setShowCalendar(true)}
        rightIcon={<ArrowRight size={iconSize.default} color={asColor(foreground)} />}
        rightLabel="Library"
        onRightPress={() => goTo(HUB.library)}
      />

      {/* Everything below the header is the heavy body: scroll content, FAB
          and the sheets. It mounts the frame after the shell paints rather
          than in the same pass, so the slide starts on the next frame instead
          of after a full mount (see `useAfterFirstPaint` and `DeferredBody`).
          The date and the entries below reveal in sequence as it lands. */}
      <DeferredBody>
        <>
        <ScrollView
        className="flex-1"
        // The content column: centred and capped on wide screens, pixel-
        // identical on phones (the cap never bites below 800). The children
        // keep their own `px-6` gutters inside the column.
        style={{ maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' }}
        contentContainerStyle={{
          paddingBottom: layout.scrollBottom + fabClearance(insets.bottom),
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Date section — first in the cascade; the entries below carry on
            the same rhythm with their own stagger. */}
        <Reveal index={0} className="gap-3 px-6 pt-6">
          <ThemedText type="headlineSm" color={asColor(mutedForeground)}>
            {dateDisplay}
          </ThemedText>
        </Reveal>

        {!hasEntries && (
          <EmptyState size="lg" className="pb-0">
            <EmptyState.Description>No activity on this day.</EmptyState.Description>
          </EmptyState>
        )}

        {/* Timeline entries for the selected day, continuing the cascade the
            date label above started — `+ 1` so the first entry lands a beat
            after it rather than alongside it. `Reveal` caps the delay itself,
            so a busy day does not turn into a queue. Actions live behind a
            long-press action sheet (Swipe stays for inline list rows). */}
        {hasEntries &&
          groups[0].entries.map((entry, index) => (
            <Reveal key={entry.id} index={index + 1}>
              <TimelineEntry
                entry={entry}
                isLast={index === groups[0].entries.length - 1}
                onPress={() => handleEntryPress(entry)}
                onLongPress={() => setLongPressEntry(entry)}
              />
            </Reveal>
          ))}
      </ScrollView>

      <Fab
        accessibilityLabel="New thought"
        bottomOffset={insets.bottom}
        onPress={() => { setEditingThought(null); setShowThoughtSheet(true); }}
      />

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

      {/* Entry action sheet — opened by long-press on a row. Same four
          actions the sheet has always had, drawn as Item rows like every
          other action sheet in the app. */}
      <Sheet
        visible={longPressEntry !== null}
        onClose={() => setLongPressEntry(null)}
      >
        {/* Menu density, same as the book action sheet — see the note there
            and the spacing contract in components/ui/sheet.tsx. */}
        <Item.Group className="gap-0">
          <ThemedText type="labelSm" color={asColor(primary)} className="px-4 pb-4">
            {longPressEntry?.type === 'thought' ? 'THOUGHT' : 'HIGHLIGHT'}
          </ThemedText>

          {longPressEntry?.type === 'thought' && (
            <Item
              className="gap-4"
              onPress={() => {
                const entry = longPressEntry;
                setLongPressEntry(null);
                if (entry) handleEditEntry(entry);
              }}
            >
              <Item.Media>
                <Pencil size={20} color={asColor(primary)} />
              </Item.Media>
              <Item.Content>
                <Item.Title>Edit</Item.Title>
              </Item.Content>
            </Item>
          )}

          <Item
            className="gap-4"
            onPress={() => {
              const entry = longPressEntry;
              setLongPressEntry(null);
              if (entry) {
                if (entry.chatSessionId) handleViewChat(entry);
                else void handleStartChat(entry);
              }
            }}
          >
            <Item.Media>
              <MessageSquare size={20} color={asColor(primary)} />
            </Item.Media>
            <Item.Content>
              <Item.Title>{longPressEntry?.chatSessionId ? 'View Chat' : 'Start Chat'}</Item.Title>
            </Item.Content>
          </Item>

          <Item
            className="gap-4"
            onPress={
              isExporting
                ? undefined
                : () => {
                  const entry = longPressEntry;
                  setLongPressEntry(null);
                  if (entry) handleExport(entry);
                }
            }
          >
            <Item.Media>
              <Share size={20} color={asColor(primary)} />
            </Item.Media>
            <Item.Content>
              <Item.Title>{isExporting ? 'Exporting…' : 'Export as Image'}</Item.Title>
            </Item.Content>
          </Item>

          <View className="h-px self-stretch bg-border" />

          <Item
            className="gap-4"
            onPress={() => {
              const entry = longPressEntry;
              setLongPressEntry(null);
              if (entry) void handleDeleteEntry(entry);
            }}
          >
            <Item.Media>
              <Trash2 size={20} color={asColor(destructive)} />
            </Item.Media>
            <Item.Content>
              <Item.Title className="text-destructive">Delete</Item.Title>
            </Item.Content>
          </Item>
        </Item.Group>
      </Sheet>

      {/* Off-screen export card */}
      {showExportCard && exportEntry && (
        <View style={{ position: 'absolute', left: -9999, top: -9999 }}>
          <ExportImageCard
            viewRef={exportViewRef}
            quoteText={exportEntry.highlightText}
            bookTitle={exportEntry.type === 'thought' ? 'A Thought' : exportEntry.bookTitle}
            authorName={exportEntry.bookAuthor}
            coverUri={exportEntry.bookCoverUrl}
            category={exportEntry.bookCategory}
            onReady={handleExportReady}
          />
        </View>
      )}
        </>
      </DeferredBody>
    </ThemedView>
  );
}
