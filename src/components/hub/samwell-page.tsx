/**
 * Samwell: two modes sharing one bar and one input.
 *
 * Chat and Compass are different conversations with different stores, but
 * they are the same *place* — the same header, the same floating card you
 * type into, the same mode switch inside it. That shared frame is all this
 * file is now. Everything with an opinion about what a chat or a check-in
 * actually does lives in `features/chat` and `features/compass`; this screen
 * decides which of the two is on screen and hands each one what it needs.
 *
 * It used to be all three things at once, which is why a change to Compass's
 * date pickers meant scrolling past the chat transcript to find them.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import React from 'react';
import { Keyboard, View, type TextInput, type ViewStyle } from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { Archive, BookOpen, CalendarDays, History, ListTodo, TrendingUp } from '@/components/icons';
import { DeferredBody } from '@/components/navigation/deferred-body';
import { Reveal } from '@/components/navigation/reveal';
import { SamwellControlCenter } from '@/components/samwell/samwell-control-center';
import { SamwellToolbox, type ToolboxItem } from '@/components/samwell/samwell-toolbox';
import { ThemedText } from '@/components/themed-text';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MaxContentWidth, spacing } from '@/constants/theme';
import { BookPickerSheet } from '@/features/chat/components/book-picker-sheet';
import { ChatHeader } from '@/features/chat/components/chat-header';
import { ChatHistorySheet } from '@/features/chat/components/chat-history-sheet';
import { ChatTranscript } from '@/features/chat/components/chat-transcript';
import { useChatSessions } from '@/features/chat/hooks/use-chat-sessions';
import { useSamwellReadiness } from '@/features/chat/hooks/use-samwell-readiness';
import { useSamwellStatus } from '@/features/chat/hooks/use-samwell-status';
import { turnIndicator } from '@/features/chat/utils/agent-activity';
import { CompassBody } from '@/features/compass/components/compass-body';
import { InsightsSheet } from '@/features/compass/components/insights-sheet';
import { LogDeckSheet } from '@/features/compass/components/log-deck-sheet';
import { OverviewSheet } from '@/features/compass/components/overview-sheet';
import { PastGoalsSheet } from '@/features/compass/components/past-goals-sheet';
import { PlannerSheet } from '@/features/compass/components/planner-sheet';
import { useCompassConversation } from '@/features/compass/hooks/use-compass-conversation';
import { useGoalEnding } from '@/features/compass/hooks/use-goal-ending';
import { useCompassChatStore } from '@/stores/compass-chat';
import { useCompassPastGoals, useCompassStore } from '@/stores/compass';
import { useAfterFirstPaint } from '@/navigation/use-after-first-paint';
import { isVisibleChatMessage } from '@/services/chat-transcript';
import { useAllBooks, useBooksStore } from '@/stores/books';
import { useChatStore, type ChatSession } from '@/stores/chat';
import { HUB, useHubStore } from '@/stores/hub';
import { useSamwellSessionStore } from '@/stores/samwell-session';
import { useSettingsStore } from '@/stores/settings';
import { asColor } from '@/utils/colors';

// The content column: centred and capped on wide screens, pixel-identical on
// phones (the cap never bites below 800). Applied to the transcripts and the
// floating control-center stack so chat stays a column on tablets; the chat
// bubbles' own `max-w-[82%]` then resolves against it.
const contentColumn: ViewStyle = {
  maxWidth: MaxContentWidth,
  width: '100%',
  alignSelf: 'center',
};

/**
 * The conversation you are leaving gets its last chance at a better title.
 *
 * Both stores are asked, whichever mode was on screen: each one already knows
 * whether it has anything to rename — the transcript has to have grown past
 * what the quick title saw, and a title that comes back unchanged raises no
 * notice — so branching on the mode here would be a second opinion about the
 * same question, in the one place least able to answer it.
 *
 * Never awaited. Both snapshot the conversation synchronously before their
 * first `await`, so the rename lands on what was left even though the cloud
 * call outlives the switch, and a slow model never holds up a swipe.
 */
function refineLeavingTitles() {
  void useChatStore.getState().refineSessionTitleOnExit().catch(() => {});
  void useCompassChatStore.getState().refineTitleOnExit().catch(() => {});
}

export function SamwellPage() {
  // Library and Timeline are peer pages of this one, reached by moving the
  // pager rather than by navigating.
  const goTo = useHubStore((s) => s.goTo);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [destructive] = useCSSVariable(['--color-destructive']);

  /** Paid once by the floating bottom stack, and covered by the keyboard when
   * one is up — so the reserve below only ever adds what sits above it. */
  const bottomInset = Math.max(insets.bottom, spacing[3]);
  /** Breathing room between the input card and the top of the keyboard. */
  const KEYBOARD_GAP = spacing[3];

  const openSettings = React.useCallback(() => router.push('/settings'), [router]);
  /**
   * Settings, landing on the Samwell section.
   *
   * A separate callback rather than an optional argument on `openSettings`:
   * that one is wired straight to `onPress` handlers, which would hand the
   * press event in as the section.
   */
  const openSamwellSettings = React.useCallback(
    () => router.push({ pathname: '/settings', params: { section: 'samwell' } }),
    [router],
  );

  // Field-by-field selectors rather than one whole-store subscription: this
  // screen is the app's largest render, and a single unrelated field change
  // (model download progress, a settings flip) used to re-run all of it.
  const cloudBaseUrl = useSettingsStore((s) => s.cloudBaseUrl);
  const samwellMode = useSettingsStore((s) => s.samwellMode);
  const cloudReady = samwellMode === 'cloud' && cloudBaseUrl.length > 0;
  const notConfigured = cloudBaseUrl.length === 0;

  const sessions = useChatStore((s) => s.sessions);
  const activeSession = useChatStore((s) => s.activeSession);
  const messages = useChatStore((s) => s.messages);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const isThinking = useChatStore((s) => s.isThinking);
  const isToolCalling = useChatStore((s) => s.isToolCalling);
  const toolCallStatus = useChatStore((s) => s.toolCallStatus);
  const toolCallName = useChatStore((s) => s.toolCallName);
  const streamingContent = useChatStore((s) => s.streamingContent);
  const thinkingContent = useChatStore((s) => s.thinkingContent);
  const thinkingSeconds = useChatStore((s) => s.thinkingSeconds);
  const lastStreamedMessageId = useChatStore((s) => s.lastStreamedMessageId);
  const loadSessions = useChatStore((s) => s.loadSessions);
  const stopGeneration = useChatStore((s) => s.stopGeneration);
  const deleteSession = useChatStore((s) => s.deleteSession);

  const readiness = useSamwellReadiness();
  const chat = useChatSessions();
  // The composer's input, so "work on it more" can put the cursor in it with
  // the draft still on screen. This is the wire the old REFINE button lacked.
  const composerRef = React.useRef<TextInput>(null);
  const compass = useCompassConversation(composerRef);
  // Read from the session list rather than held separately, so a re-title
  // lands on the bar the moment the list refreshes.
  const compassTitle =
    compass.sessions.find((session) => session.id === compass.activeSessionId)?.title ?? null;

  const loadCompass = useCompassStore((s) => s.loadCompass);
  const compassActiveGoals = useCompassStore((s) => s.activeGoals);
  const compassPrimaryGoalId = useCompassStore((s) => s.primaryGoalId);
  const setPrimaryGoal = useCompassStore((s) => s.setPrimaryGoal);
  const compassPastGoals = useCompassPastGoals();
  /* Ending a goal is two things — the archive write, and Samwell's reading of
     it — and this owns the seam between them. See `useGoalEnding`. */
  const { finishGoal, abandonGoal, writingTakeaway, retryTakeaway } = useGoalEnding();
  /*
   * The goal the single-goal Insights sheet shows: the primary, or the only
   * one there is. Nothing "points at" a goal any more — the deck, the planner
   * and Samwell's tools all span the whole active set — so this is just which
   * goal that sheet is about, and it only opens at all when there is one.
   */
  const activeGoal =
    compassActiveGoals.find((g) => g.id === compassPrimaryGoalId) ?? compassActiveGoals[0] ?? null;
  const compassTrackables = useCompassStore((s) => s.trackables);
  const compassLogs = useCompassStore((s) => s.logsByTrackable);
  const compassDue = useCompassStore((s) => s.due);
  const compassConsistencyByGoal = useCompassStore((s) => s.consistencyByGoal);
  const compassError = useCompassStore((s) => s.error);

  const trackableTitles = React.useMemo(
    () => Object.fromEntries(compassTrackables.map((t) => [t.id, t.title])),
    [compassTrackables],
  );

  const { newChat } = chat;
  const status = useSamwellStatus({
    readiness,
    onOpenSettings: openSamwellSettings,
    onNewChat: React.useCallback(() => void newChat(), [newChat]),
  });

  const allBooks = useAllBooks();

  // Held in a store rather than in this component: the screen is pushed now,
  // so leaving it unmounts it, and a half-finished check-in is a conversation
  // the user has already had once. See `stores/samwell-session`.
  const mode = useSamwellSessionStore((s) => s.mode);
  const text = useSamwellSessionStore((s) => s.draft);
  const pendingBook = useSamwellSessionStore((s) => s.pendingBook);
  const setSession = useSamwellSessionStore((s) => s.set);
  // Flipping the mode switch leaves a conversation as surely as walking off
  // the screen does, so it names the one being left. Read from the store
  // rather than from the `mode` above, so a double tap on the mode already
  // showing is not treated as leaving anything.
  const setMode = React.useCallback(
    (next: 'chat' | 'compass') => {
      if (next !== useSamwellSessionStore.getState().mode) refineLeavingTitles();
      setSession({ mode: next });
    },
    [setSession],
  );
  const setText = React.useCallback((next: string) => setSession({ draft: next }), [setSession]);

  const [confirmDelete, setConfirmDelete] = React.useState<ChatSession | null>(null);
  const [showBookPicker, setShowBookPicker] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const [showCompassHistory, setShowCompassHistory] = React.useState(false);
  const [confirmDeleteCompass, setConfirmDeleteCompass] = React.useState<ChatSession | null>(null);
  const [showDeck, setShowDeck] = React.useState(false);
  const [showPlanner, setShowPlanner] = React.useState(false);
  const [showInsights, setShowInsights] = React.useState(false);
  const [showOverview, setShowOverview] = React.useState(false);
  const [showPastGoals, setShowPastGoals] = React.useState(false);
  // Held, not inline: the planner is memoized so that a reply streaming behind
  // it does not redraw a month grid per token, and a fresh closure per render
  // would defeat that on its own.
  const closePlanner = React.useCallback(() => setShowPlanner(false), []);

  // The input card and nav float over the transcript so messages stay visible
  // through the gaps around them. Their combined height is measured rather
  // than assumed, since the card grows with the text field and the nav
  // collapses when dragged away.
  const [floatingBottomHeight, setFloatingBottomHeight] = React.useState(0);

  // Leaving the hub route — a book, Settings, a chat opened on its own — is
  // one of the ways out, the same thing `chat/[id]` does on its own blur.
  useFocusEffect(React.useCallback(() => refineLeavingTitles, []));

  /*
   * And swiping off this page is the other, far more common one.
   *
   * This screen is the third page of a pager, not a route: all three are
   * mounted at once and moving between them is deliberately not navigation,
   * so `useFocusEffect` above never fires for it. Without this, walking back
   * to the Library — which is how anyone actually leaves a conversation —
   * skipped the rename entirely.
   *
   * Subscribed imperatively rather than through a selector: this is the app's
   * largest render, and reading the page through `useHubStore` would re-run
   * all of it every time the pager settles anywhere, to answer a question
   * nothing on screen draws from.
   */
  React.useEffect(() => {
    let wasHere = useHubStore.getState().page === HUB.samwell;
    return useHubStore.subscribe((state) => {
      const isHere = state.page === HUB.samwell;
      if (wasHere && !isHere) refineLeavingTitles();
      wasHere = isHere;
    });
  }, []);

  // No KeyboardAvoidingView: this screen is edge-to-edge, so the window never
  // resizes for the keyboard and a KAV can only fight the absolute layout —
  // `behavior="height"` double-counted and left the card stranded.
  const keyboard = useAnimatedKeyboard();
  /*
   * The floating stack rides up on the keyboard as a transform, not as a
   * spacer that grows under it. A spacer meant a Yoga pass on this stack every
   * frame the keyboard moved, on the screen whose keyboard opens most. A
   * transform moves the same pixels and touches no layout, and it keeps
   * `floatingBottomHeight` constant instead of remeasuring it per frame.
   *
   * A gap, because landing the card exactly on the keyboard's edge clips its
   * border and its shadow, which reads as the keyboard cutting into it.
   *
   * No dependency array: on native it is warned about rather than merely
   * unnecessary, and the worklet already captures both values from closure.
   */
  const keyboardLiftStyle = useAnimatedStyle(() => {
    const height = keyboard.height.get();
    const lift = height > 0 ? Math.max(0, height + KEYBOARD_GAP - bottomInset) : 0;
    return { transform: [{ translateY: -lift }] };
  });

  // Kept off the screen's first render so the push can start immediately;
  // see the hook. One frame, not the whole transition.
  const painted = useAfterFirstPaint();

  React.useEffect(() => {
    // Session + book loads are DB reads and stay off the transition path —
    // the transcript region they feed is deferred anyway.
    if (!painted) return;
    loadSessions();
    // The books store is otherwise only filled by the Library tab, so a
    // session opened before visiting it could not resolve its book's cover.
    if (useBooksStore.getState().books.length === 0) {
      void useBooksStore.getState().loadBooks();
    }
  }, [painted, loadSessions]);

  React.useEffect(() => {
    if (!painted || !cloudReady) return;
    void loadCompass();
    void useCompassChatStore.getState().loadSessions();
  }, [painted, cloudReady, loadCompass]);

  const visibleChatMessages = React.useMemo(
    () => messages.filter(isVisibleChatMessage),
    [messages],
  );

  const displayedBookTitle = activeSession?.bookTitle ?? pendingBook?.title ?? null;
  const displayedBookCover = activeSession?.bookId
    ? (allBooks.find((b) => b.id === activeSession.bookId)?.coverUrl ?? null)
    : pendingBook
      ? (allBooks.find((b) => b.id === pendingBook.id)?.coverUrl ?? null)
      : null;
  // Once a session exists, its book is fixed context — the button is only
  // worth showing then if there's a book to display; a bookless session's
  // button would just be inert with nothing to say.
  const showBookButton = !activeSession || activeSession.bookId != null;

  // `isGenerating` alone drives the activity indicator; it must never show
  // just because the model isn't ready, since there is nothing to wait for
  // then. The input additionally disables on "not ready".
  const chatInputBusy = isGenerating || !readiness.ready || readiness.loading;

  // `isGenerating` alone isn't "waiting for a reply" — it stays true after the
  // reply has landed while the engine does follow-up work (auto-titling a
  // fresh bookless chat runs on it). Once the last message is Samwell's own
  // there is nothing left to wait for, and showing "thinking" past that point
  // reads as stuck rather than busy.
  const lastVisibleRole = visibleChatMessages[visibleChatMessages.length - 1]?.role;
  const stillWaitingForReply = isGenerating && lastVisibleRole !== 'assistant';
  const isStreamingText = streamingContent.length > 0;

  // Keyed on primitives: the indicator object rides into the transcript and
  // its rows, which are memoized, so a fresh object per render (this screen
  // re-renders on every streamed token) would defeat them.
  const indicator = React.useMemo(
    () =>
      turnIndicator({
        isGenerating: stillWaitingForReply,
        isToolCalling,
        toolCallName,
        toolCallStatus,
        isThinking,
        isStreaming: isStreamingText,
        trace: thinkingContent,
        traceSeconds: thinkingSeconds ?? undefined,
      }),
    [
      stillWaitingForReply,
      isToolCalling,
      toolCallName,
      toolCallStatus,
      isThinking,
      isStreamingText,
      thinkingContent,
      thinkingSeconds,
    ],
  );

  // Tapping a referenced highlight opens it at its exact place in the reader;
  // a thought has no passage to open, so it goes to the timeline that holds it.
  const handleNavigateToHighlight = React.useCallback(
    (bookId: string, locator: string) => {
      router.push({ pathname: '/reader/[id]', params: { id: bookId, locator } });
    },
    [router],
  );
  const handleNavigateToTimeline = React.useCallback(() => goTo(HUB.timeline), [goTo]);
  // A recommended book opens where the reader would go next: the reader
  // itself, which resumes at their saved position for a book already started.
  const handleNavigateToBook = React.useCallback(
    (bookId: string) => {
      router.push({ pathname: '/reader/[id]', params: { id: bookId } });
    },
    [router],
  );

  /** Bottom padding that keeps content clear of the floating card and nav. */
  const floatingClearance = React.useMemo(
    () => ({ paddingBottom: floatingBottomHeight + spacing[3] }),
    [floatingBottomHeight],
  );

  async function handleSend() {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    setText('');
    if (mode === 'chat') await chat.send(trimmed);
    else await compass.send(trimmed);
  }

  // A focused text input's keyboard dismissing at the same time a bottom
  // sheet is trying to present is a common cause of the sheet silently
  // failing to reach its snap point — settle the keyboard first.
  //
  // `useCallback` because the toolbox's item list is memoised on it: a fresh
  // identity here every render would defeat that memo entirely.
  const openSheet = React.useCallback((open: (v: boolean) => void) => {
    Keyboard.dismiss();
    open(true);
  }, []);

  const busy = mode === 'chat' ? chatInputBusy : compass.isBusy;
  const locked = isGenerating || chat.switching !== null || compass.isBusy;

  /*
   * The drawer under the control unit, and what the current mode puts in it.
   *
   * MEMOISED, and it matters more than it looks. This screen subscribes to
   * `streamingContent`, so it re-renders on every token of a reply — and an
   * un-memoised list rebuilt five item objects with five fresh closures each
   * time, re-rendering five `Tool` rows, each an `AnimatedPressable` with two
   * texts and two icons, for a drawer that is shut and invisible. That is
   * roughly twenty-five component renders per token, spent on nothing.
   *
   * An earlier comment here argued a memo would be re-run anyway because the
   * entries close over turn-scoped values. That was wrong twice: most of those
   * values are stable through a turn (counts, ids, which book is pinned), and
   * "the deps change sometimes" is an argument for listing them, not for
   * rebuilding unconditionally on the app's hottest render path.
   *
   * A tool that opens a sheet shuts the drawer on the way, so coming back from
   * the sheet lands on the plain card rather than on the state you left.
   */
  const [toolboxOpen, setToolboxOpen] = React.useState(false);
  const closeToolbox = React.useCallback(() => setToolboxOpen(false), []);

  /** Open a sheet from a tool: put the drawer away, then raise the sheet. */
  const fromToolbox = React.useCallback(
    (open: (v: boolean) => void) => () => {
      closeToolbox();
      openSheet(open);
    },
    [closeToolbox, openSheet],
  );

  const chatSessionCount = sessions.length;
  const compassSessionCount = compass.sessions.length;
  const dueCount = compassDue.length;
  const trackableCount = compassTrackables.length;
  const activeGoalCount = compassActiveGoals.length;
  const pastGoalCount = compassPastGoals.length;

  const toolboxItems: ToolboxItem[] = React.useMemo(() =>
    mode === 'chat'
      ? [
          // The book this chat is pinned to. Its cover stands in for the icon
          // once one is picked, which is the whole answer to "which book is
          // Samwell reading with me" without a line of text for it.
          ...(showBookButton
            ? [
                {
                  id: 'book',
                  icon: BookOpen,
                  label: 'Book',
                  lead: true,
                  detail: displayedBookTitle ?? 'None yet',
                  image: displayedBookCover,
                  active: displayedBookTitle != null,
                  onPress:
                    activeSession || isGenerating || chat.switching
                      ? undefined
                      : fromToolbox(setShowBookPicker),
                  // Long-press to drop it, only before a session exists: once
                  // a chat has started, its book is fixed context.
                  onLongPress:
                    activeSession || !pendingBook || isGenerating || chat.switching
                      ? undefined
                      : () => setSession({ pendingBook: null }),
                } satisfies ToolboxItem,
              ]
            : []),
          {
            id: 'history',
            icon: History,
            label: 'History',
            detail: chatSessionCount > 0 ? `${chatSessionCount} saved` : 'Nothing yet',
            // Picking a conversation mid-turn is what used to race the engine.
            onPress:
              isGenerating || chat.switching ? undefined : fromToolbox(setShowHistory),
          },
        ]
      : cloudReady
        ? [
            {
              id: 'deck',
              // What Compass is FOR, so it leads the drawer at full width.
              // The count belongs here now rather than as a badge on a bare
              // icon: this row has somewhere to say it in words, and "3 to
              // log" answers the question a badge only hints at.
              icon: ListTodo,
              label: 'Log today',
              lead: true,
              detail: dueCount > 0 ? `${dueCount} to log` : 'All done',
              active: activeGoal != null && dueCount > 0,
              onPress:
                activeGoal != null && dueCount > 0 ? fromToolbox(setShowDeck) : undefined,
            },
            {
              id: 'planner',
              icon: CalendarDays,
              label: 'Planner',
              detail: `${trackableCount} ${trackableCount === 1 ? 'activity' : 'activities'}`,
              onPress: activeGoal != null ? fromToolbox(setShowPlanner) : undefined,
            },
            {
              id: 'insights',
              icon: TrendingUp,
              label: 'Insights',
              detail: `${activeGoalCount} ${activeGoalCount === 1 ? 'goal' : 'goals'}`,
              // One goal is that goal's Insights; two or more make the same
              // tool open the overview of the set.
              onPress:
                activeGoal != null
                  ? fromToolbox(activeGoalCount >= 2 ? setShowOverview : setShowInsights)
                  : undefined,
            },
            {
              id: 'history',
              icon: History,
              label: 'History',
              detail:
                compassSessionCount > 0 ? `${compassSessionCount} saved` : 'Nothing yet',
              onPress:
                compass.submitting || compass.switching
                  ? undefined
                  : fromToolbox(setShowCompassHistory),
            },
            // Only once something has actually ended. An archive with nothing
            // in it teaches nobody anything, and the first goal a reader
            // closes out is exactly when this becomes worth finding.
            ...(pastGoalCount > 0
              ? [
                  {
                    id: 'past-goals',
                    icon: Archive,
                    label: 'Past goals',
                    detail: `${pastGoalCount} closed`,
                    onPress: fromToolbox(setShowPastGoals),
                  } satisfies ToolboxItem,
                ]
              : []),
          ]
        : // Offline, Compass has no server to reach: every tool here would
          // open a sheet onto an empty store. The empty state above already
          // says what to do about it.
          [],
  [
    mode,
    fromToolbox,
    // Chat
    showBookButton,
    displayedBookCover,
    displayedBookTitle,
    activeSession,
    isGenerating,
    chat.switching,
    pendingBook,
    setSession,
    chatSessionCount,
    // Compass
    cloudReady,
    activeGoal,
    dueCount,
    trackableCount,
    activeGoalCount,
    pastGoalCount,
    compassSessionCount,
    compass.submitting,
    compass.switching,
  ]);

  return (
    <View className="flex-1 bg-background">
      <View style={{ paddingTop: insets.top }}>
        {/* Back always returns to the Library — this screen is a spoke off it,
            and switching between chats is the history sheet's job, not the
            back button's. Compass keeps the centred bar: its name is fixed, so
            there is nothing to truncate and nothing to align to. */}
        {mode === 'compass' ? (
          <ChatHeader
            // Named once Samwell has titled it, exactly as a reading chat is.
            // A Compass conversation is one you can leave and come back to, so
            // "Compass" is the name of the surface, not of the conversation.
            title={compassTitle}
            fallbackTitle="Compass"
            onBack={() => goTo(HUB.library)}
            backLabel="Library"
            onWakeSamwell={readiness.initContext}
            onOpenSettings={openSettings}
          />
        ) : (
          <ChatHeader
            // Null until the conversation has a name of its own: a picked book
            // is not yet a chat, so the bar still centres on Samwell and the
            // book rides in the badge underneath.
            title={activeSession?.title ?? null}
            bookTitle={displayedBookTitle}
            onBack={() => goTo(HUB.library)}
            backLabel="Library"
            onOpenBook={
              activeSession?.bookId && activeSession.contextLocator
                ? () =>
                    router.push({
                      pathname: '/reader/[id]',
                      params: {
                        id: activeSession.bookId as string,
                        locator: activeSession.contextLocator as string,
                      },
                    })
                : undefined
            }
            onWakeSamwell={readiness.initContext}
            onOpenSettings={openSettings}
          />
        )}
      </View>

      {/* Everything below the header is the heavy body. It mounts the frame
          after the shell paints rather than in the same pass, so the push
          starts on the next frame instead of after a full mount; the
          transition runs on the UI thread, so the mount lands during the
          slide rather than holding it up. */}
      <DeferredBody>
        <>
          {/* The transcript region and the floating card below are the
              screen's two beats: the content it came for, then the thing to
              type into. */}
          <Reveal index={0} className="flex-1">
            {mode === 'chat' ? (
              <ChatTranscript
                sessionId={activeSession?.id ?? null}
                messages={visibleChatMessages}
                streamingContent={streamingContent}
                isGenerating={isGenerating}
                indicator={indicator}
                lastStreamedMessageId={lastStreamedMessageId}
                status={status}
                pendingUserMessage={chat.pendingUserMessage}
                contentColumn={contentColumn}
                floatingClearance={floatingClearance}
                onNavigateToHighlight={handleNavigateToHighlight}
                onNavigateToTimeline={handleNavigateToTimeline}
                onNavigateToBook={handleNavigateToBook}
              />
            ) : (
              <CompassBody
                conversation={compass}
                cloudReady={cloudReady}
                notConfigured={notConfigured}
                onOpenSettings={openSamwellSettings}
                trackableTitles={trackableTitles}
                contentColumn={contentColumn}
                floatingClearance={floatingClearance}
              />
            )}
          </Reveal>

          {/* Floats over the transcript rather than sitting below it, so
              messages run the full height and scroll behind the card.
              Scrollable children pay for the overlap with `floatingClearance`. */}
          <Animated.View className="absolute bottom-0 left-0 right-0" style={keyboardLiftStyle}>
            <Reveal
              index={1}
              style={{ paddingBottom: bottomInset }}
              onLayout={(e) => setFloatingBottomHeight(e.nativeEvent.layout.height)}
            >
              {/* Inside the floating stack rather than above it — left in
                  normal flow it would end up hidden behind the card. */}
              {compassError != null && (
                <ThemedText
                  type="bodySm"
                  color={asColor(destructive)}
                  className="px-4 pb-2"
                  // Inline rather than `contentColumn`: ThemedText takes a
                  // TextStyle, and the shared const is typed as a ViewStyle.
                  style={{ maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' }}
                >
                  {compassError}
                </ThemedText>
              )}

              <View className="px-4 pt-2" style={contentColumn}>
                <SamwellControlCenter
                  mode={mode}
                  onSelectMode={setMode}
                  lockMode={locked}
                  toolboxOpen={toolboxOpen}
                  onToggleToolbox={() => setToolboxOpen((v) => !v)}
                  hasTools={toolboxItems.length > 0}
                  inputRef={composerRef}
                  text={text}
                  onChangeText={setText}
                  onSend={handleSend}
                  busy={busy}
                  // Both modes get a Stop while a turn is in flight — Compass
                  // is a cloud turn like any other and can be called off the
                  // same way, rather than the send button just greying out.
                  showStop={mode === 'chat' ? isGenerating : compass.submitting}
                  onStop={mode === 'chat' ? stopGeneration : compass.stop}
                  placeholder={
                    mode === 'chat'
                      ? 'Message Samwell…'
                      : compass.kind === 'plan'
                        ? 'What do you want to work on?'
                        : 'Talk to Samwell about it…'
                  }
                  /* Offline, Compass has no server to reach, so the field
                      would take a message nothing can answer. Its tools go
                      away with it — see `toolboxItems`. */
                  unavailable={mode === 'compass' && !cloudReady}
                />

                {/* Under the card, sharing its bottom edge. The stack is
                    anchored to the bottom of the screen, so opening the drawer
                    lifts the control unit rather than pushing anything off:
                    the field you were writing in stays where your eye is, and
                    the tools arrive in the space that opens beneath it. */}
                {/* `&&` rather than `toolboxOpen` alone: a mode with no tools
                    hides the handle, and a drawer left open behind a handle
                    that is gone could never be shut again. Switching into
                    offline Compass with it out closes it on the way. */}
                <SamwellToolbox
                  open={toolboxOpen && toolboxItems.length > 0}
                  items={toolboxItems}
                />
              </View>
            </Reveal>
          </Animated.View>

          <BookPickerSheet
            visible={showBookPicker}
            onSelect={(bookId, bookTitle) => {
              setSession({ pendingBook: { id: bookId, title: bookTitle } });
              setShowBookPicker(false);
            }}
            onClose={() => setShowBookPicker(false)}
          />

          <ChatHistorySheet
            visible={showHistory}
            sessions={sessions}
            switching={chat.switching}
            onSelect={(id) => {
              setShowHistory(false);
              void chat.selectSession(id);
            }}
            onNewChat={() => {
              setShowHistory(false);
              void chat.newChat();
            }}
            // The confirm is a dialog over the page, so the sheet steps aside
            // first — two overlays stacked on each other is how you end up
            // dismissing the wrong one.
            onRequestDelete={(session) => {
              setShowHistory(false);
              setConfirmDelete(session);
            }}
            onClose={() => setShowHistory(false)}
          />

          {/* The same sheet the reading history uses. A Compass conversation is
              a chat, so the way back into an earlier one should not be a
              different-looking list that behaves differently. */}
          <ChatHistorySheet
            visible={showCompassHistory}
            heading="Past conversations"
            newLabel="New conversation"
            sessions={compass.sessions}
            switching={compass.switching}
            onSelect={(id) => {
              setShowCompassHistory(false);
              void compass.openSession(id);
            }}
            onNewChat={() => {
              setShowCompassHistory(false);
              void compass.newSession();
            }}
            onRequestDelete={(session) => {
              setShowCompassHistory(false);
              setConfirmDeleteCompass(session);
            }}
            onClose={() => setShowCompassHistory(false)}
          />

          <ConfirmDialog
            visible={confirmDeleteCompass !== null}
            title="Delete conversation?"
            message={confirmDeleteCompass?.title}
            onClose={() => setConfirmDeleteCompass(null)}
            actions={[
              { label: 'CANCEL', onPress: () => setConfirmDeleteCompass(null) },
              {
                label: 'DELETE',
                destructive: true,
                onPress: () => {
                  const target = confirmDeleteCompass;
                  setConfirmDeleteCompass(null);
                  if (target) void compass.deleteSession(target.id);
                },
              },
            ]}
          />

          <ConfirmDialog
            visible={confirmDelete !== null}
            title="Delete chat?"
            message={confirmDelete?.title}
            onClose={() => setConfirmDelete(null)}
            actions={[
              { label: 'CANCEL', onPress: () => setConfirmDelete(null) },
              {
                label: 'DELETE',
                destructive: true,
                onPress: () => {
                  if (confirmDelete) void deleteSession(confirmDelete.id);
                  setConfirmDelete(null);
                },
              },
            ]}
          />

          <LogDeckSheet visible={showDeck} onClose={() => setShowDeck(false)} />

          <PlannerSheet
            visible={showPlanner}
            onClose={closePlanner}
            trackables={compassTrackables}
            logsByTrackable={compassLogs}
          />

          <InsightsSheet
            visible={showInsights}
            onClose={() => setShowInsights(false)}
            goal={activeGoal}
            consistency={activeGoal ? (compassConsistencyByGoal.get(activeGoal.id) ?? null) : null}
            onFinishGoal={finishGoal}
            onAbandonGoal={abandonGoal}
          />

          <OverviewSheet
            visible={showOverview}
            onClose={() => setShowOverview(false)}
            goals={compassActiveGoals}
            primaryGoalId={compassPrimaryGoalId}
            consistencyByGoal={compassConsistencyByGoal}
            onMakePrimary={(goalId) => void setPrimaryGoal(goalId)}
            onFinishGoal={finishGoal}
            onAbandonGoal={abandonGoal}
          />

          <PastGoalsSheet
            visible={showPastGoals}
            onClose={() => setShowPastGoals(false)}
            entries={compassPastGoals}
            writingTakeaway={writingTakeaway}
            onRetryTakeaway={(goalId) => void retryTakeaway(goalId)}
          />
        </>
      </DeferredBody>
    </View>
  );
}
