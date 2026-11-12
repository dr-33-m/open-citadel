import { eq } from 'drizzle-orm';
import { useRouter } from 'expo-router';
import { Calendar, ChevronRight, MessageSquare, Pencil, PencilSparkles, Share, Trash2 } from '@/components/icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettledFocusEffect } from "@/navigation/use-settled-focus-effect";

import { fabClearance } from '@/components/fab-placement';
import { PageFade } from '@/components/scroll-fades';
import { ScreenFab } from '@/components/screen-fab';
import { DeferredBody } from '@/components/navigation/deferred-body';
import { Reveal } from '@/components/navigation/reveal';
import { CalendarPicker } from '@/components/timeline/calendar-picker';
import { useFabBottom } from '@/hooks/use-fab-bottom';
import { useToday } from '@/hooks/use-today';
import { QuoteExportCard } from '@/components/export/quote-export-card';
import { useQuoteExport } from '@/hooks/use-quote-export';
import { NewThoughtSheet } from '@/components/timeline/new-thought-sheet';
import type { ThoughtEditData } from '@/components/timeline/new-thought-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TimelineEntry } from '@/components/timeline/timeline-entry';
import { EmptyState } from '@/components/ui/empty-state';
import { Item } from '@/components/ui/item';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Sheet } from '@/components/ui/sheet';
import { contentColumn, iconSize, layout } from '@/constants/theme';
import { db } from '@/db/client';
import { highlights, thoughts } from '@/db/schema';
import { sessionExists } from '@/services/chat-sessions';
import { playHighlight } from '@/services/podcasts/transcript/highlights';
import { highlightChatContext } from '@/services/highlight-context';
import { showChatOnSamwellPage } from '@/services/samwell-handoff';
import { fetchAllTags } from '@/stores/reader';
import { formatDateLabel, useTimelineStore, type TimelineItem } from '@/stores/timeline';
import { HUB, useHubStore } from '@/stores/hub';
import { useChatStore } from '@/stores/chat';
import { asColor } from '@/utils/colors';

export function TimelinePage() {
  const insets = useSafeAreaInsets();
  // Where every screen's floating button sits, so the list clears it here too.
  const fabBottom = useFabBottom();
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
  /*
   * Stable, so the `memo` on `CalendarPicker` actually holds. Inline arrows
   * here handed it new props on every render of this screen, and it rebuilt a
   * month of cells each time — for a sheet that is closed almost always.
   */
  const closeCalendar = useCallback(() => setShowCalendar(false), []);
  const pickDate = useCallback(
    (date: string) => {
      setSelectedDate(date);
      setShowCalendar(false);
    },
    [setSelectedDate],
  );
  const [showThoughtSheet, setShowThoughtSheet] = useState(false);
  const [editingThought, setEditingThought] = useState<ThoughtEditData | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  /** The entry whose action sheet is open — long-press on a row opens it. */
  const [longPressEntry, setLongPressEntry] = useState<TimelineItem | null>(null);

  const quoteExport = useQuoteExport();

  // Load on mount, and again whenever the hub comes back to the front, once
  // the screen that was on top has finished leaving: reloading on the frame
  // focus returned re-rendered this page in the middle of the back slide.
  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);
  useSettledFocusEffect(loadTimeline, { skipFirst: true });

  // Load shared tags when opening the thought sheet
  useEffect(() => {
    if (showThoughtSheet) {
      fetchAllTags().then(setAllTags);
    }
  }, [showThoughtSheet]);

  /*
   * Follow the day over when the reader was sitting on today.
   *
   * `selectedDate` is seeded once, when the store module is first evaluated,
   * so an app left open across midnight kept yesterday selected. Nothing was
   * broken enough to notice at a glance either: the label recomputes against
   * the real clock, so the screen quietly relabelled itself "Yesterday" and
   * stayed there, showing a day the reader had not chosen.
   *
   * Only when they were on the old today. Somebody who deliberately paged back
   * to last Tuesday should still be on last Tuesday at 00:01, and having the
   * screen jump under them would be the worse bug of the two.
   */
  const today = useToday();
  const previousToday = useRef(today);
  useEffect(() => {
    if (previousToday.current === today) return;
    const wasOnToday = selectedDate === previousToday.current;
    previousToday.current = today;
    if (wasOnToday) setSelectedDate(today);
  }, [today, selectedDate, setSelectedDate]);

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
    // An episode's highlight plays from its moment, in the player (this page
    // has no mini player, so the audio would otherwise start unseen), rather
    // than opening the transcript's book.
    if (entry.bookKind === 'episode') {
      void playHighlight(entry.bookId, entry.highlightLocator).then((played) =>
        router.push(played ? '/podcasts/player' : (`/reader/${entry.bookId}` as any)),
      );
      return;
    }
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
    const isThought = entry.type === 'thought';
    const sessionId = await createChatSession({
      bookId: entry.bookId || undefined,
      title: entry.highlightText.slice(0, 60),
      contextText: isThought ? undefined : await highlightChatContext(entry.id, entry.highlightText),
      thoughtText: isThought ? entry.highlightText : undefined,
      contextLocator: entry.highlightLocator ?? undefined,
    });
    // Link the chat back to the entry so it shows View Chat next time
    if (entry.type === 'highlight') {
      await db.update(highlights).set({ chatSessionId: sessionId }).where(eq(highlights.id, entry.id));
    } else if (entry.type === 'thought') {
      await db.update(thoughts).set({ chatSessionId: sessionId }).where(eq(thoughts.id, entry.id));
    }
    await loadTimeline();
    await showChatOnSamwellPage(sessionId);
  };

  // The Samwell page is this screen's neighbour on the hub: the chat opens
  // there, and the pager slides across to it. A chat since deleted is started
  // again, with its context, rather than opened blank.
  const handleViewChat = (entry: TimelineItem) => {
    if (entry.chatSessionId && sessionExists(entry.chatSessionId)) void showChatOnSamwellPage(entry.chatSessionId);
    else void handleStartChat(entry);
  };

  const handleDeleteEntry = async (entry: TimelineItem) => {
    if (entry.type === 'thought') {
      await deleteThought(entry.id);
    } else if (entry.type === 'highlight') {
      await deleteHighlight(entry.id);
    }
  };

  const isExporting = quoteExport.exporting;
  const handleExport = (entry: TimelineItem) =>
    quoteExport.share({
      text: entry.highlightText,
      title: entry.type === 'thought' ? 'A Thought' : entry.bookTitle,
      author: entry.bookAuthor,
      coverUri: entry.bookCoverUrl,
      detail: entry.bookCategory,
      squareCover: entry.bookKind === 'episode',
    });

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
        rightIcon={<ChevronRight size={iconSize.default} color={asColor(foreground)} />}
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
        {/* Replaces the header's bottom rule — see library-page. */}
        <PageFade>
          <ScrollView
          className="flex-1"
          // The content column: centred and capped on wide screens, pixel-
          // identical on phones (the cap never bites below 800). The children
          // keep their own `px-6` gutters inside the column.
          style={contentColumn}
          contentContainerStyle={{
            paddingBottom: layout.scrollBottom + fabClearance(fabBottom),
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
        </PageFade>

      <ScreenFab
        icon={PencilSparkles}
        accessibilityLabel="New thought"
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
        onSelectDate={pickDate}
        onClose={closeCalendar}
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
            // The rule rides with the row: a highlight has no Edit action, and
            // a hairline left behind would open the menu with a line under
            // nothing.
            <>
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

              <View className="h-px self-stretch bg-border" />
            </>
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

          <View className="h-px self-stretch bg-border" />

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

      <QuoteExportCard {...quoteExport.card} />
        </>
      </DeferredBody>
    </ThemedView>
  );
}
