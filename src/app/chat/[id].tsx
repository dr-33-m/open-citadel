/**
 * One conversation, opened directly.
 *
 * The hub's Samwell page is where chat usually happens; this screen is what
 * the reader and the timeline push when they mean *this* conversation — a
 * passage you asked about, a thought you followed up on. It is the same
 * conversation either way, so everything with an opinion about how a chat
 * looks or behaves is shared with the hub page rather than restated here.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatBubble } from '@/components/chat/chat-bubble';
import { TranscriptFade } from '@/components/scroll-fades';
import { MessageScroller } from '@/components/ui/message-scroller';
import { MaxContentWidth } from '@/constants/theme';
import { TurnStatus } from '@/features/chat/components/turn-status';
import { ChatComposer } from '@/features/chat/components/chat-composer';
import { ChatHeader } from '@/features/chat/components/chat-header';
import { SamwellBanner } from '@/features/chat/components/samwell-banner';
import { useSamwellReadiness } from '@/features/chat/hooks/use-samwell-readiness';
import { turnIndicator } from '@/features/chat/utils/agent-activity';
import { transcriptContent } from '@/features/chat/utils/transcript-layout';
import { backTo } from '@/navigation/navigate';
import { isVisibleChatMessage } from '@/services/chat-transcript';
import { useChatStore, type ChatMessage } from '@/stores/chat';
import { HUB, useHubStore } from '@/stores/hub';

/** One turn, as the virtualized transcript wants it: the message plus the
 *  navigation metadata rows outside the render window still have to carry. */
type TranscriptRow = ChatMessage & { messageId: string; scrollAnchor: boolean };

/* Static styles hoisted — new objects per render re-layout the list's
    container for no reason. */
const LIST_STYLE = { flex: 1 } as const;
const COLUMN_STYLE = {
  maxWidth: MaxContentWidth,
  width: '100%',
  alignSelf: 'center',
} as const;

export default function ChatSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  /* Field selectors, not the whole store: a streaming reply writes to the
     store on every token, and the subscribe-to-everything form re-rendered
     this screen — header, banner and composer included — once per token. */
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
  const openSession = useChatStore((s) => s.openSession);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const stopGeneration = useChatStore((s) => s.stopGeneration);

  const readiness = useSamwellReadiness();

  const [inputText, setInputText] = useState('');
  /* "Stop" was tapped for the reply currently running. Derived rather than
     synced: an effect that reset it when generation ended was a setState in
     an effect, i.e. a second render every time a reply finished, to compute
     something already implied by `isGenerating`. It is cleared when the next
     send starts instead, which is the only moment it could go stale. */
  const [stopRequested, setStopRequested] = useState(false);
  const isStopping = isGenerating && stopRequested;

  useEffect(() => {
    if (id) openSession(id);
  }, [id, openSession]);

  // Re-title a bookless chat from the whole conversation once the user
  // leaves it, so a name generated from just the opening exchange can be
  // corrected once there's more to go on.
  useFocusEffect(
    useCallback(() => {
      return () => {
        useChatStore.getState().refineSessionTitleOnExit();
      };
    }, []),
  );

  /* There was an AppState listener here that called `useModelStore.getState()`
     on resume and threw the result away, commented as forcing a re-read of
     `isLoaded`. It could not do that: `getState` is a plain getter with no
     side effect, and a Zustand store does not re-render anything because it
     was read. It was removed rather than kept as decoration. Nothing is lost —
     this screen subscribes to `isLoaded` through `useSamwellReadiness`, so a
     genuine change already re-renders it. Re-validating a native engine that
     was invalidated while backgrounded needs an action on the model store that
     does not exist yet; that is a separate piece of work, not a getter call. */

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isGenerating || !readiness.ready) return;
    setInputText('');
    setStopRequested(false);
    await sendMessage(text);
  }, [inputText, isGenerating, readiness.ready, sendMessage]);

  const handleStop = useCallback(() => {
    setStopRequested(true);
    stopGeneration();
  }, [stopGeneration]);

  /*
   * Memoized: during a stream this screen re-renders on every token, and an
   * unmemoized filter hands the list a new `data` array each time — it would
   * re-run its item diff (new elements for every bubble) on tokens that
   * changed no message. With a stable reference the list skips entirely; only
   * the streaming footer re-renders per token.
   *
   * The id and the anchor flag ride on the row rather than being passed to a
   * wrapper, because rows outside the render window are never mounted: the
   * scroller reads them off the data to know where a turn starts.
   */
  const rows = useMemo<TranscriptRow[]>(
    () =>
      messages.filter(isVisibleChatMessage).map((m) => ({
        ...m,
        messageId: m.id,
        scrollAnchor: m.role === 'user',
      })),
    [messages],
  );

  const handleNavigateToHighlight = useCallback(
    (bookId: string, locator: string) => {
      router.push({ pathname: '/reader/[id]', params: { id: bookId, locator } });
    },
    [router],
  );

  const handleNavigateToTimeline = useCallback(() => {
    // The Timeline is a page of the hub, not a route above this one: ask for
    // the page, then leave the stack so the hub is what's underneath. Pushing
    // the hub again instead would stack a second copy of it.
    useHubStore.getState().goTo(HUB.timeline);
    backTo(router, '/');
  }, [router]);

  const handleNavigateToBook = useCallback(
    (bookId: string) => {
      router.push({ pathname: '/reader/[id]', params: { id: bookId } });
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: TranscriptRow }) => (
      <ChatBubble
        role={item.role as 'user' | 'assistant'}
        content={item.content}
        onNavigateToHighlight={handleNavigateToHighlight}
        onNavigateToTimeline={handleNavigateToTimeline}
        onNavigateToBook={handleNavigateToBook}
      />
    ),
    [handleNavigateToHighlight, handleNavigateToTimeline, handleNavigateToBook],
  );

  /*
   * Keyed on primitives, not recomputed bare: a fresh indicator object per
   * render would defeat the footer's memo below and re-render the turn row
   * on every streamed token.
   */
  const isStreamingText = streamingContent.length > 0;
  const indicator = useMemo(
    () =>
      turnIndicator({
        isGenerating,
        isToolCalling,
        toolCallName,
        toolCallStatus,
        isThinking,
        isStreaming: isStreamingText,
        trace: thinkingContent,
        traceSeconds: thinkingSeconds ?? undefined,
      }),
    [
      isGenerating,
      isToolCalling,
      toolCallName,
      toolCallStatus,
      isThinking,
      isStreamingText,
      thinkingContent,
      thinkingSeconds,
    ],
  );

  const listFooter = useMemo(() => {
    // The streaming bubble first, then the one live row beneath it — a plain
    // status line, or the reasoning panel with any tool work folded into its
    // trigger. Renders nothing when there is nothing to report.
    return (
      <>
        {isGenerating && streamingContent ? (
          <ChatBubble
            role="assistant"
            content={streamingContent}
            streaming
            onNavigateToHighlight={handleNavigateToHighlight}
            onNavigateToTimeline={handleNavigateToTimeline}
            onNavigateToBook={handleNavigateToBook}
          />
        ) : null}
        <TurnStatus indicator={indicator} />
      </>
    );
  }, [
    isGenerating,
    streamingContent,
    indicator,
    handleNavigateToHighlight,
    handleNavigateToTimeline,
    handleNavigateToBook,
  ]);

  const openBookAtPassage =
    activeSession?.bookId && activeSession.contextLocator
      ? () =>
          router.push({
            pathname: '/reader/[id]',
            params: {
              id: activeSession.bookId as string,
              locator: activeSession.contextLocator as string,
            },
          })
      : undefined;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
    >
      {/* The content column: centred and capped on wide screens, pixel-
          identical on phones (the cap never bites below 800). The header
          and input rules stop at the column's edges along with it. */}
      <View className="flex-1" style={COLUMN_STYLE}>
        <View style={{ paddingTop: insets.top }}>
          <ChatHeader
            title={activeSession?.title ?? null}
            bookTitle={activeSession?.bookTitle ?? null}
            onBack={() => router.back()}
            backLabel="Back"
            onOpenBook={openBookAtPassage}
            onWakeSamwell={readiness.initContext}
            onOpenSettings={() => router.push('/settings')}
          />
        </View>

        <SamwellBanner readiness={readiness} onOpenSettings={() => router.push('/settings')} />

        {/* The virtualized transcript path: only the rows near the viewport
            are mounted, and following the live edge, holding position through
            a prepend and opening on the last question the reader asked are
            the scroller's, not this screen's. It replaced a FlashList driven
            by a hand-rolled follow that scrolled to the end on a timer — which
            pulled the reader back down whatever they were reading. */}
        <MessageScroller autoScroll className="flex-1" defaultScrollPosition="last-anchor">
          {/* `start` only: unlike the hub's transcripts, nothing floats over
              this one — the composer below is in normal flow, so the bottom is
              an edge content stops at rather than passes behind. */}
          <TranscriptFade edges="start">
            <MessageScroller.List
              style={LIST_STYLE}
              contentContainerStyle={transcriptContent}
              data={rows}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              renderItem={renderItem}
              ListFooterComponent={listFooter}
            />
          </TranscriptFade>
          <MessageScroller.Button />
        </MessageScroller>

        <ChatComposer
          value={inputText}
          onChangeText={setInputText}
          onSend={handleSend}
          onStop={handleStop}
          isGenerating={isGenerating}
          isStopping={isStopping}
          readiness={readiness}
          bottomInset={insets.bottom}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
