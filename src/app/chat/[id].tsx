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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, View } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatBubble } from '@/components/chat/chat-bubble';
import { ThinkingSection } from '@/components/chat/thinking-section';
import { MaxContentWidth, spacing } from '@/constants/theme';
import { AgentStatus } from '@/features/chat/components/agent-status';
import { ChatComposer } from '@/features/chat/components/chat-composer';
import { ChatHeader } from '@/features/chat/components/chat-header';
import { SamwellBanner } from '@/features/chat/components/samwell-banner';
import { useSamwellReadiness } from '@/features/chat/hooks/use-samwell-readiness';
import { useScrollToLatest } from '@/features/chat/hooks/use-scroll-to-latest';
import { agentActivity } from '@/features/chat/utils/agent-activity';
import { backTo } from '@/navigation/navigate';
import { isVisibleChatMessage } from '@/services/chat-transcript';
import { useChatStore, type ChatMessage } from '@/stores/chat';
import { HUB, useHubStore } from '@/stores/hub';

/* Static styles hoisted — new objects per render re-layout the list's
    container for no reason. */
const LIST_STYLE = { flex: 1 } as const;
const LIST_CONTENT_STYLE = {
  paddingTop: spacing[4],
  paddingBottom: spacing[2],
} as const;
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
  const listRef = useRef<FlashListRef<ChatMessage>>(null);

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

  useScrollToLatest(listRef, { messageCount: messages.length, streamingContent });

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
   * unmemoized filter hands FlashList a new `data` array each time — it
   * would re-run its item diff (new elements for every bubble) on tokens
   * that changed no message. With a stable reference FlashList skips
   * entirely; only the streaming footer re-renders per token.
   */
  const visibleMessages = useMemo(
    () => messages.filter(isVisibleChatMessage),
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
    ({ item }: { item: ChatMessage }) => (
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

  const activity = agentActivity({
    isGenerating,
    isToolCalling,
    toolCallName,
    toolCallStatus,
    isThinking,
    isStreaming: streamingContent.length > 0,
  });

  const listFooter = useMemo(() => {
    // The finished reply's trace, the live activity line, the streaming
    // bubble, or nothing — in that order, and never two at once.
    if (!isGenerating && thinkingContent) return <ThinkingSection content={thinkingContent} />;
    if (activity) return <AgentStatus activity={activity} />;
    if (isGenerating && streamingContent) {
      return (
        <ChatBubble
          role="assistant"
          content={streamingContent}
          streaming
          onNavigateToHighlight={handleNavigateToHighlight}
          onNavigateToTimeline={handleNavigateToTimeline}
          onNavigateToBook={handleNavigateToBook}
        />
      );
    }
    return null;
  }, [
    isGenerating,
    thinkingContent,
    activity,
    streamingContent,
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

        <FlashList
          ref={listRef}
          style={LIST_STYLE}
          contentContainerStyle={LIST_CONTENT_STYLE}
          data={visibleMessages}
          keyExtractor={(item: ChatMessage) => item.id}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          renderItem={renderItem}
          ListFooterComponent={listFooter}
        />

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
