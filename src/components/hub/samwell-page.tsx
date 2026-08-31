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
import { ArrowLeft, Settings } from 'lucide-react-native';
import React from 'react';
import { Keyboard, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { DeferredBody } from '@/components/navigation/deferred-body';
import { Reveal } from '@/components/navigation/reveal';
import { SamwellControlCenter } from '@/components/samwell/samwell-control-center';
import { ThemedText } from '@/components/themed-text';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ScreenHeader } from '@/components/ui/screen-header';
import { iconSize, MaxContentWidth, spacing } from '@/constants/theme';
import { BookPickerSheet } from '@/features/chat/components/book-picker-sheet';
import { ChatHeader } from '@/features/chat/components/chat-header';
import { ChatHistorySheet } from '@/features/chat/components/chat-history-sheet';
import { ChatTranscript } from '@/features/chat/components/chat-transcript';
import { useChatSessions } from '@/features/chat/hooks/use-chat-sessions';
import { useSamwellReadiness } from '@/features/chat/hooks/use-samwell-readiness';
import { useSamwellStatus } from '@/features/chat/hooks/use-samwell-status';
import { agentActivity } from '@/features/chat/utils/agent-activity';
import { CompassBody } from '@/features/compass/components/compass-body';
import { CompassOverlays } from '@/features/compass/components/compass-overlays';
import { useCompassFlow } from '@/features/compass/hooks/use-compass-flow';
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
  const [foreground, destructive] = useCSSVariable(['--color-foreground', '--color-destructive']);

  /** Paid once by the floating bottom stack, and covered by the keyboard when
   * one is up — so the reserve below only ever adds what sits above it. */
  const bottomInset = Math.max(insets.bottom, spacing[3]);
  /** Breathing room between the input card and the top of the keyboard. */
  const KEYBOARD_GAP = spacing[3];

  const openSettings = React.useCallback(() => router.push('/settings'), [router]);

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
  const loadSessions = useChatStore((s) => s.loadSessions);
  const stopGeneration = useChatStore((s) => s.stopGeneration);
  const deleteSession = useChatStore((s) => s.deleteSession);

  const readiness = useSamwellReadiness();
  const chat = useChatSessions();
  const compass = useCompassFlow();

  const { newChat } = chat;
  const status = useSamwellStatus({
    readiness,
    onOpenSettings: openSettings,
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
  const [showProgress, setShowProgress] = React.useState(false);

  // The input card and nav float over the transcript so messages stay visible
  // through the gaps around them. Their combined height is measured rather
  // than assumed, since the card grows with the text field and the nav
  // collapses when dragged away.
  const [floatingBottomHeight, setFloatingBottomHeight] = React.useState(0);

  // Leaving this screen is where a bookless chat gets its last chance to pick
  // up a better title from its full transcript — the same thing `chat/[id]`
  // does on its own blur.
  useFocusEffect(
    React.useCallback(() => {
      return () => {
        void useChatStore.getState().refineSessionTitleOnExit();
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

  const { loadCompass } = compass;
  React.useEffect(() => {
    if (painted && cloudReady) loadCompass();
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

  const activity = agentActivity({
    isGenerating: stillWaitingForReply,
    isToolCalling,
    toolCallName,
    toolCallStatus,
    isThinking,
    isStreaming: streamingContent.length > 0,
  });

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

  const busy = mode === 'chat' ? chatInputBusy : compass.busy;
  const locked = isGenerating || chat.switching !== null || compass.busy;

  return (
    <View className="flex-1 bg-background">
      <View style={{ paddingTop: insets.top }}>
        {/* Back always returns to the Library — this screen is a spoke off it,
            and switching between chats is the history sheet's job, not the
            back button's. Compass keeps the centred bar: its name is fixed, so
            there is nothing to truncate and nothing to align to. */}
        {mode === 'compass' ? (
          <ScreenHeader
            title="Compass"
            leftIcon={<ArrowLeft size={iconSize.default} color={asColor(foreground)} />}
            leftLabel="Library"
            onLeftPress={() => goTo(HUB.library)}
            rightIcon={<Settings size={iconSize.default} color={asColor(foreground)} />}
            rightLabel="Settings"
            onRightPress={openSettings}
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
                thinkingContent={thinkingContent}
                isGenerating={isGenerating}
                activity={activity}
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
                compass={compass}
                cloudReady={cloudReady}
                notConfigured={notConfigured}
                onOpenSettings={openSettings}
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
              {compass.error != null && (
                <ThemedText
                  type="bodySm"
                  color={asColor(destructive)}
                  className="px-4 pb-2"
                  // Inline rather than `contentColumn`: ThemedText takes a
                  // TextStyle, and the shared const is typed as a ViewStyle.
                  style={{ maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' }}
                >
                  {compass.error}
                </ThemedText>
              )}

              <View className="px-4 pt-2" style={contentColumn}>
                <SamwellControlCenter
                  mode={mode}
                  compassOpen={compass.open}
                  compassPeek={compass.peek}
                  onSelectMode={setMode}
                  lockMode={locked}
                  onTogglePeek={() => setSession({ compassPeek: !compass.peek })}
                  text={text}
                  onChangeText={setText}
                  onSend={handleSend}
                  busy={busy}
                  showStop={mode === 'chat' && isGenerating}
                  onStop={stopGeneration}
                  placeholder={mode === 'chat' ? 'Message Samwell…' : compass.placeholder}
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
                  onOpenHistory={
                    isGenerating || chat.switching ? undefined : () => openSheet(setShowHistory)
                  }
                  hasGoal={compass.goal != null}
                  onOpenGoal={() => setShowProgress(true)}
                  onOpenMilestone={() => setShowProgress(true)}
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

          <CompassOverlays
            compass={compass}
            showProgress={showProgress}
            onCloseProgress={() => setShowProgress(false)}
          />
        </>
      </DeferredBody>
    </View>
  );
}
