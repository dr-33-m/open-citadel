import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Search, Send, Sparkles, Square } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  KeyboardAvoidingView,
  TextInput,
  View,
} from "react-native";
import { Touchable } from "@/components/ui/touchable";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCSSVariable } from "uniwind";

import { ChatBubble } from "@/components/chat/chat-bubble";
import { ModelStatusBar } from "@/components/chat/model-status-bar";
import { ThinkingSection } from "@/components/chat/thinking-section";
import { ThemedText } from "@/components/themed-text";
import { isVisibleChatMessage } from "@/services/chat-transcript";
import { fontFamily, spacing, MaxContentWidth } from "@/constants/theme";
import { cn } from "@/lib/cn";
import { asColor } from "@/utils/colors";
import { useChatStore, type ChatMessage } from "@/stores/chat";
import { useModelStore } from "@/stores/model";
import { useSettingsStore } from "@/stores/settings";
import { HUB, useHubStore } from '@/stores/hub';
import { backTo } from '@/navigation/navigate';

/* Static styles hoisted — new objects per render re-layout the list's
    container for no reason. */
const LIST_STYLE = { flex: 1 } as const;
const LIST_CONTENT_STYLE = {
  paddingTop: spacing[4],
  paddingBottom: spacing[2],
} as const;

export default function ChatSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [primary, mutedForeground, foreground, primaryForeground, destructive] =
    useCSSVariable([
      "--color-primary",
      "--color-muted-foreground",
      "--color-foreground",
      "--color-primary-foreground",
      "--color-destructive",
    ]);

  const {
    activeSession,
    messages,
    isGenerating,
    isThinking,
    isToolCalling,
    toolCallStatus,
    streamingContent,
    thinkingContent,
    openSession,
    sendMessage,
    stopGeneration,
  } = useChatStore();
  const { isLoaded, isLoading, loadError, activeModelId, models, modelsHydrated, initContext } =
    useModelStore();
  const { samwellMode, cloudBaseUrl } = useSettingsStore();

  const [inputText, setInputText] = useState("");
  const [isStopping, setIsStopping] = useState(false);
  const listRef = useRef<FlashListRef<ChatMessage>>(null);

  const activeModel = models.find((m) => m.id === activeModelId);
  const modelReady = samwellMode === 'cloud' ? cloudBaseUrl.length > 0 : isLoaded;
  // While the model list is still hydrating we don't know whether a model is
  // downloaded — claim nothing so the first open never tells an
  // already-configured install to "set up Samwell".
  const modelDownloaded = samwellMode === 'cloud'
    ? true
    : modelsHydrated
      ? (activeModel?.isDownloaded ?? false)
      : true;

  useEffect(() => {
    if (id) openSession(id);
  }, [id]);

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

  // Check model validity when app returns from background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // Force re-read of isLoaded — if the native engine was invalidated
        // while backgrounded, the UI will show the "load model" prompt
        useModelStore.getState();
      }
    });
    return () => sub.remove();
  }, []);

  // Reset stop debounce when generation ends
  useEffect(() => {
    if (!isGenerating) setIsStopping(false);
  }, [isGenerating]);

  // Scroll to bottom whenever messages or streaming content changes. The
  // timer is cleared on the next change and on unmount — during a stream this
  // effect re-runs on every token, and an uncleared 50ms timer per token
  // stacks up hundreds deep.
  useEffect(() => {
    if (messages.length === 0) return;
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [messages.length, streamingContent]);

  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const showPulse = isGenerating && !streamingContent;
  useEffect(() => {
    if (!showPulse) {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(0.4);
      return;
    }
    // Keep the loop handle so it is stopped on unmount too, not only when
    // `showPulse` next flips false.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [showPulse]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isGenerating || !modelReady) return;
    setInputText("");
    await sendMessage(text);
  }, [inputText, isGenerating, modelReady, sendMessage]);

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

  const handleNavigateToHighlight = useCallback((bookId: string, locator: string) => {
    router.push({
      pathname: '/reader/[id]' as any,
      params: { id: bookId, locator },
    });
  }, [router]);

  const handleNavigateToTimeline = useCallback(() => {
    // The Timeline is a page of the hub, not a route above this one: ask for
    // the page, then leave the stack so the hub is what's underneath. Pushing
    // the hub again instead would stack a second copy of it.
    useHubStore.getState().goTo(HUB.timeline);
    backTo(router, '/');
  }, [router]);

  const handleNavigateToBook = useCallback((bookId: string) => {
    router.push({ pathname: '/reader/[id]' as any, params: { id: bookId } });
  }, [router]);

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <ChatBubble
        role={item.role as "user" | "assistant"}
        content={item.content}
        onNavigateToHighlight={handleNavigateToHighlight}
        onNavigateToTimeline={handleNavigateToTimeline}
        onNavigateToBook={handleNavigateToBook}
      />
    ),
    [handleNavigateToHighlight, handleNavigateToTimeline, handleNavigateToBook],
  );

  const listFooter = React.useMemo(() => {
    // After generation completes, show expandable thinking section if available
    if (!isGenerating && thinkingContent) {
      return <ThinkingSection content={thinkingContent} />;
    }
    if (!isGenerating) return null;
    // Tool calling in progress — show search indicator
    if (isToolCalling) return (
      <View className="flex-row justify-start mb-1 px-4">
        <View className="flex-row items-center gap-2 bg-muted py-2 px-3">
          <Animated.View style={{ opacity: pulseAnim }}>
            <Search size={14} color={asColor(primary)} />
          </Animated.View>
          <ThemedText type="bodySm" color={asColor(mutedForeground)}>
            {toolCallStatus ?? 'Searching…'}
          </ThemedText>
        </View>
      </View>
    );
    // Streaming response tokens
    if (streamingContent) return (
      <ChatBubble
        role="assistant"
        content={streamingContent}
        streaming
        onNavigateToHighlight={handleNavigateToHighlight}
        onNavigateToTimeline={handleNavigateToTimeline}
        onNavigateToBook={handleNavigateToBook}
      />
    );
    // Waiting for first token — show "Thinking" or "Processing" based on mode
    return (
      <View className="flex-row justify-start mb-1 px-4">
        <View className="flex-row items-center gap-2 bg-muted py-2 px-3">
          <Animated.View style={{ opacity: pulseAnim }}>
            <Sparkles size={14} color={asColor(primary)} />
          </Animated.View>
          <ThemedText type="bodySm" color={asColor(mutedForeground)}>
            {isThinking ? 'Thinking…' : 'Processing…'}
          </ThemedText>
        </View>
      </View>
    );
  }, [isGenerating, isThinking, isToolCalling, toolCallStatus, streamingContent, thinkingContent, pulseAnim, primary, mutedForeground, handleNavigateToHighlight]);

  function renderBanner() {
    if (samwellMode === 'cloud' && !cloudBaseUrl) {
      return (
        <View className="m-3 gap-2 border border-surface-tertiary bg-muted p-3">
          <ThemedText type="bodySm" color={asColor(mutedForeground)}>
            Grand Maester Samwell is not set up in this build yet.
          </ThemedText>
        </View>
      );
    }

    if (samwellMode === 'cloud') return null;

    if (!modelDownloaded) {
      return (
        <View className="m-3 gap-2 border border-surface-tertiary bg-muted p-3">
          <ThemedText type="bodySm" color={asColor(mutedForeground)}>
            Samwell needs a model to run. Set one up in Settings.
          </ThemedText>
          <Touchable
            className="self-start bg-primary px-3 py-1"
            onPress={() => router.push({ pathname: "/settings" })}
          >
            <ThemedText type="labelSm" color={asColor(primaryForeground)}>
              SET UP SAMWELL
            </ThemedText>
          </Touchable>
        </View>
      );
    }

    if (loadError) {
      return (
        <View className="m-3 gap-2 border border-surface-tertiary bg-muted p-3">
          <ThemedText type="bodySm" color={asColor(destructive)}>
            {loadError}
          </ThemedText>
          <Touchable
            className={cn("self-start bg-primary px-3 py-1", isLoading && "opacity-50")}
            disabled={isLoading}
            onPress={initContext}
          >
            <ThemedText type="labelSm" color={asColor(primaryForeground)}>
              RETRY
            </ThemedText>
          </Touchable>
        </View>
      );
    }

    if (!modelReady && !isLoading) {
      return (
        <View className="m-3 gap-2 border border-surface-tertiary bg-muted p-3">
          <ThemedText type="bodySm" color={asColor(mutedForeground)}>
            Samwell is offline. Wake him up to chat.
          </ThemedText>
          <Touchable
            className={cn("self-start bg-primary px-3 py-1", isLoading && "opacity-50")}
            disabled={isLoading}
            onPress={initContext}
          >
            <ThemedText type="labelSm" color={asColor(primaryForeground)}>
              WAKE UP
            </ThemedText>
          </Touchable>
        </View>
      );
    }

    return null;
  }

  const canSend = modelReady && inputText.trim().length > 0 && !isGenerating;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={process.env.EXPO_OS === "ios" ? "padding" : "height"}
    >
      {/* The content column: centred and capped on wide screens, pixel-
          identical on phones (the cap never bites below 800). The header
          and input rules stop at the column's edges along with it. */}
      <View
        className="flex-1"
        style={{ maxWidth: MaxContentWidth, width: "100%", alignSelf: "center" }}
      >
        {/* Header */}
        <View
          className="flex-row items-center gap-3 border-b border-border px-4 pb-2"
          style={{ paddingTop: insets.top + spacing[2] }}
        >
          {/* `-ml-1` cancels the button's own padding so the *glyph* lands on
              the gutter, not the tap target's box — the title and the message
              rows below it are both at `px-4`. */}
          <Touchable className="-ml-1 p-1" onPress={() => router.back()}>
            <ArrowLeft size={22} color={asColor(foreground)} />
          </Touchable>
          <View className="flex-1 gap-0.5">
            <ThemedText type="bodyMd" numberOfLines={1}>
              {activeSession?.title ?? "…"}
            </ThemedText>
            {/* "wrap" (not "nowrap") so the book badge drops below Samwell's name
                instead of overflowing off-screen when the name is long — it's
                "Grand Maester Samwell" in cloud mode, vs. just "Samwell" offline. */}
            <View className="flex-row flex-wrap items-center gap-2">
              <ModelStatusBar onPress={initContext} />
              {activeSession?.bookTitle && (
                <Touchable
                  className="max-w-[55%] self-start bg-muted px-2 py-0.5"
                  onPress={() => {
                    if (activeSession.bookId && activeSession.contextLocator) {
                      router.push({
                        pathname: '/reader/[id]' as any,
                        params: {
                          id: activeSession.bookId,
                          locator: activeSession.contextLocator,
                        },
                      });
                    }
                  }}
                >
                  <ThemedText
                    type="labelSm"
                    color={asColor(primary)}
                    numberOfLines={1}
                  >
                    {activeSession.bookTitle}
                  </ThemedText>
                </Touchable>
              )}
            </View>
          </View>
        </View>

        {/* Banner area */}
        {renderBanner()}

        {/* Messages */}
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

        {/* Input bar */}
        <View
          className="flex-row items-end gap-2 border-t border-border bg-background px-3 pt-2"
          style={{ paddingBottom: Math.max(insets.bottom, spacing[2]) }}
        >
          <TextInput
            className="max-h-[120px] min-h-[40px] flex-1 bg-muted px-3 py-2 text-[15px] text-foreground"
            style={{ fontFamily: fontFamily.sans }}
            placeholder={
              !modelDownloaded
                ? "Set up Samwell in Settings…"
                : samwellMode === 'cloud' && !cloudBaseUrl
                  ? "Cloud unavailable in this build…"
                : !modelReady
                  ? "Wake up Samwell…"
                  : "Message Samwell…"
            }
            placeholderTextColor={asColor(mutedForeground)}
            value={inputText}
            onChangeText={setInputText}
            multiline
            editable={modelReady && !isGenerating}
            onSubmitEditing={handleSend}
          />

          {isGenerating ? (
            <Touchable
              className={cn(
                "h-10 w-10 items-center justify-center bg-surface-tertiary",
                isStopping && "opacity-50",
              )}
              disabled={isStopping}
              onPress={() => {
                setIsStopping(true);
                stopGeneration();
              }}
            >
              <Square
                size={16}
                color={asColor(foreground)}
                fill={asColor(foreground)}
              />
            </Touchable>
          ) : (
            <Touchable
              className={cn(
                "h-10 w-10 items-center justify-center bg-primary",
                !canSend && "bg-surface-tertiary",
              )}
              onPress={handleSend}
              disabled={!canSend}
            >
              <Send
                size={16}
                color={canSend ? asColor(primaryForeground) : asColor(mutedForeground)}
              />
            </Touchable>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
