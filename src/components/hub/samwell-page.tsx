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

import { DeferredBody } from '@/components/navigation/deferred-body';
import { Reveal } from '@/components/navigation/reveal';
import { SamwellControlCenter } from '@/components/samwell/samwell-control-center';
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
import { GoalSwitcher } from '@/features/compass/components/goal-switcher';
import { InsightsSheet } from '@/features/compass/components/insights-sheet';
import { LogDeckSheet } from '@/features/compass/components/log-deck-sheet';
import { PlannerSheet } from '@/features/compass/components/planner-sheet';
import { useCompassConversation } from '@/features/compass/hooks/use-compass-conversation';
import { useCompassChatStore } from '@/stores/compass-chat';
import { useCompassStore } from '@/stores/compass';
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
  const activeGoal = useCompassStore((s) => s.goals.find((g) => g.id === s.activeGoalId) ?? null);
  const compassActiveGoals = useCompassStore((s) => s.activeGoals);
  const compassActiveGoalId = useCompassStore((s) => s.activeGoalId);
  const compassPrimaryGoalId = useCompassStore((s) => s.primaryGoalId);
  const selectGoal = useCompassStore((s) => s.selectGoal);
  const compassTrackables = useCompassStore((s) => s.trackables);
  const compassLogs = useCompassStore((s) => s.logsByTrackable);
  const compassDue = useCompassStore((s) => s.due);
  const compassConsistency = useCompassStore((s) => s.consistency);
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
  const setMode = React.useCallback(
    (next: 'chat' | 'compass') => setSession({ mode: next }),
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

  // The input card and nav float over the transcript so messages stay visible
  // through the gaps around them. Their combined height is measured rather
  // than assumed, since the card grows with the text field and the nav
  // collapses when dragged away.
  const [floatingBottomHeight, setFloatingBottomHeight] = React.useState(0);

  // Leaving this screen is where a conversation gets its last chance to pick
  // up a better title from its full transcript — the same thing `chat/[id]`
  // does on its own blur. Both modes, since both keep named history and only
  // the mode you were actually in has anything to re-title.
  useFocusEffect(
    React.useCallback(() => {
      return () => {
        void useChatStore.getState().refineSessionTitleOnExit();
        void useCompassChatStore.getState().refineTitleOnExit();
      };
    }, []),
  );

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
  function openSheet(open: (v: boolean) => void) {
    Keyboard.dismiss();
    open(true);
  }

  const busy = mode === 'chat' ? chatInputBusy : compass.isBusy;
  const locked = isGenerating || chat.switching !== null || compass.isBusy;

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
                  goalSwitcher={
                    compassActiveGoals.length > 0 ? (
                      <GoalSwitcher
                        goals={compassActiveGoals}
                        activeGoalId={compassActiveGoalId}
                        primaryGoalId={compassPrimaryGoalId}
                        onSelect={selectGoal}
                        onNewGoal={() => void compass.newSession()}
                        disabled={locked}
                      />
                    ) : undefined
                  }
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
                  showBookButton={showBookButton}
                  pendingBookTitle={displayedBookTitle}
                  pendingBookCover={displayedBookCover}
                  onOpenBookPicker={
                    activeSession || isGenerating || chat.switching
                      ? undefined
                      : () => openSheet(setShowBookPicker)
                  }
                  onClearBook={
                    activeSession || !pendingBook || isGenerating || chat.switching
                      ? undefined
                      : () => setSession({ pendingBook: null })
                  }
                  // Disabled while generating or switching — selecting a
                  // session while either is happening is what raced the engine.
                  // Disabled while a turn or a switch is in flight on the
                  // mode being asked: picking a conversation mid-turn is what
                  // used to race the engine.
                  onOpenHistory={
                    mode === 'compass'
                      ? compass.submitting || compass.switching
                        ? undefined
                        : () => openSheet(setShowCompassHistory)
                      : isGenerating || chat.switching
                        ? undefined
                        : () => openSheet(setShowHistory)
                  }
                  /* Offline, Compass has no server to reach, so its three
                      controls would open sheets onto an empty store and the
                      field would take a message nothing can answer. */
                  unavailable={mode === 'compass' && !cloudReady}
                  hasGoal={activeGoal != null}
                  dueCount={compassDue.length}
                  onOpenDeck={() => openSheet(setShowDeck)}
                  onOpenPlanner={() => openSheet(setShowPlanner)}
                  onOpenInsights={() => openSheet(setShowInsights)}
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
            onClose={() => setShowPlanner(false)}
            trackables={compassTrackables}
            logsByTrackable={compassLogs}
          />

          <InsightsSheet
            visible={showInsights}
            onClose={() => setShowInsights(false)}
            goal={activeGoal}
            consistency={compassConsistency}
            trackables={compassTrackables}
            logsByTrackable={compassLogs}
          />
        </>
      </DeferredBody>
    </View>
  );
}
