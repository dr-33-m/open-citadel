import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Search, Send, Sparkles, Square } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  AppState,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Touchable } from "@/components/ui/touchable";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChatBubble } from "@/components/chat/chat-bubble";
import { ModelStatusBar } from "@/components/chat/model-status-bar";
import { ThinkingSection } from "@/components/chat/thinking-section";
import { ThemedText } from "@/components/themed-text";
import { spacing } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import { useChatStore, type ChatMessage } from "@/stores/chat";
import { useModelStore } from "@/stores/model";
import { useSettingsStore } from "@/stores/settings";

export default function ChatSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

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
  const { isLoaded, isLoading, loadError, activeModelId, models, initContext } =
    useModelStore();
  const { samwellMode, cloudBaseUrl } = useSettingsStore();

  const [inputText, setInputText] = useState("");
  const [isStopping, setIsStopping] = useState(false);
  const listRef = useRef<FlashListRef<ChatMessage>>(null);

  const activeModel = models.find((m) => m.id === activeModelId);
  const modelReady = samwellMode === 'cloud' ? cloudBaseUrl.length > 0 : isLoaded;
  const modelDownloaded = samwellMode === 'cloud' ? true : (activeModel?.isDownloaded ?? false);

  useEffect(() => {
    if (id) openSession(id);
  }, [id]);

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

  // Scroll to bottom whenever messages or streaming content changes
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [messages.length, streamingContent]);

  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const showPulse = isGenerating && !streamingContent;
  useEffect(() => {
    if (showPulse) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        ]),
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(0.4);
    }
  }, [showPulse]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isGenerating || !modelReady) return;
    setInputText("");
    await sendMessage(text);
  }, [inputText, isGenerating, modelReady, sendMessage]);

  // Visible messages (hide system prompt, tool messages, and tool-call assistant messages)
  const visibleMessages = messages.filter(
    (m) => m.role !== "system" && m.role !== "tool" && !m.content.startsWith('\0TOOL_CALL\0')
  );

  const handleNavigateToHighlight = useCallback((bookId: string, locator: string) => {
    router.push({
      pathname: '/reader/[id]' as any,
      params: { id: bookId, locator },
    });
  }, [router]);

  const handleNavigateToTimeline = useCallback(() => {
    router.push({ pathname: '/(tabs)' as any });
  }, [router]);

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <ChatBubble
        role={item.role as "user" | "assistant"}
        content={item.content}
        onNavigateToHighlight={handleNavigateToHighlight}
        onNavigateToTimeline={handleNavigateToTimeline}
      />
    ),
    [handleNavigateToHighlight, handleNavigateToTimeline],
  );

  const listFooter = React.useMemo(() => {
    // After generation completes, show expandable thinking section if available
    if (!isGenerating && thinkingContent) {
      return <ThinkingSection content={thinkingContent} />;
    }
    if (!isGenerating) return null;
    // Tool calling in progress — show search indicator
    if (isToolCalling) return (
      <View style={{ flexDirection: 'row', justifyContent: 'flex-start', marginBottom: spacing[1], paddingHorizontal: spacing[4] }}>
        <View style={{ paddingVertical: spacing[2], paddingHorizontal: spacing[3], backgroundColor: colors.surface.mid, flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Animated.View style={{ opacity: pulseAnim }}>
            <Search size={14} color={colors.primary.default} />
          </Animated.View>
          <ThemedText type="bodySm" color={colors.text.secondary}>
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
      />
    );
    // Waiting for first token — show "Thinking" or "Processing" based on mode
    return (
      <View style={{ flexDirection: 'row', justifyContent: 'flex-start', marginBottom: spacing[1], paddingHorizontal: spacing[4] }}>
        <View style={{ paddingVertical: spacing[2], paddingHorizontal: spacing[3], backgroundColor: colors.surface.mid, flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Animated.View style={{ opacity: pulseAnim }}>
            <Sparkles size={14} color={colors.primary.default} />
          </Animated.View>
          <ThemedText type="bodySm" color={colors.text.secondary}>
            {isThinking ? 'Thinking…' : 'Processing…'}
          </ThemedText>
        </View>
      </View>
    );
  }, [isGenerating, isThinking, isToolCalling, toolCallStatus, streamingContent, thinkingContent, pulseAnim, colors, handleNavigateToHighlight]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface.base,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing[3],
      paddingHorizontal: spacing[3],
      paddingTop: insets.top + spacing[2],
      paddingBottom: spacing[2],
      borderBottomWidth: 1,
      borderBottomColor: colors.outline.variant,
    },
    headerCenter: {
      flex: 1,
      gap: 2,
    },
    headerSubRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing[2],
      flexWrap: "nowrap",
    },
    bookChip: {
      alignSelf: "flex-start",
      paddingHorizontal: spacing[2],
      paddingVertical: 2,
      backgroundColor: colors.surface.mid,
      maxWidth: "55%",
    },
    backBtn: {
      padding: spacing[1],
    },
    messageList: {
      flex: 1,
    },
    listContent: {
      paddingTop: spacing[4],
      paddingBottom: spacing[2],
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: spacing[2],
      paddingHorizontal: spacing[3],
      paddingTop: spacing[2],
      paddingBottom: Math.max(insets.bottom, spacing[2]),
      borderTopWidth: 1,
      borderTopColor: colors.outline.variant,
      backgroundColor: colors.surface.base,
    },
    textInput: {
      flex: 1,
      minHeight: 40,
      maxHeight: 120,
      backgroundColor: colors.surface.mid,
      paddingHorizontal: spacing[3],
      paddingVertical: spacing[2],
      color: colors.text.primary,
      fontFamily: "Manrope_400Regular",
      fontSize: 15,
    },
    sendBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary.default,
    },
    sendBtnDisabled: {
      backgroundColor: colors.surface.highest,
    },
    stopBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface.highest,
    },
    banner: {
      margin: spacing[3],
      padding: spacing[3],
      backgroundColor: colors.surface.mid,
      borderWidth: 1,
      borderColor: colors.surface.highest,
      gap: spacing[2],
    },
    loadBtn: {
      alignSelf: "flex-start",
      paddingHorizontal: spacing[3],
      paddingVertical: spacing[1],
      backgroundColor: colors.primary.default,
    },
  });

  function renderBanner() {
    if (samwellMode === 'cloud' && !cloudBaseUrl) {
      return (
        <View style={styles.banner}>
          <ThemedText type="bodySm" color={colors.text.secondary}>
            Grand Maester Samwell is not set up in this build yet.
          </ThemedText>
        </View>
      );
    }

    if (samwellMode === 'cloud') return null;

    if (!modelDownloaded) {
      return (
        <View style={styles.banner}>
          <ThemedText type="bodySm" color={colors.text.secondary}>
            Samwell needs a model to run. Set one up in Settings.
          </ThemedText>
          <Touchable
            style={styles.loadBtn}
            onPress={() => router.push({ pathname: "/settings" })}
          >
            <ThemedText type="labelSm" color={colors.text.inverse}>
              SET UP SAMWELL
            </ThemedText>
          </Touchable>
        </View>
      );
    }

    if (loadError) {
      return (
        <View style={styles.banner}>
          <ThemedText type="bodySm" color="#e53935">
            {loadError}
          </ThemedText>
          <Touchable
            style={[styles.loadBtn, isLoading && { opacity: 0.5 }]}
            disabled={isLoading}
            onPress={initContext}
          >
            <ThemedText type="labelSm" color={colors.text.inverse}>
              RETRY
            </ThemedText>
          </Touchable>
        </View>
      );
    }

    if (!modelReady && !isLoading) {
      return (
        <View style={styles.banner}>
          <ThemedText type="bodySm" color={colors.text.secondary}>
            Samwell is offline. Wake him up to chat.
          </ThemedText>
          <Touchable
            style={[styles.loadBtn, isLoading && { opacity: 0.5 }]}
            disabled={isLoading}
            onPress={initContext}
          >
            <ThemedText type="labelSm" color={colors.text.inverse}>
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
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View style={styles.header}>
        <Touchable style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color={colors.text.primary} />
        </Touchable>
        <View style={styles.headerCenter}>
          <ThemedText type="bodyMd" numberOfLines={1}>
            {activeSession?.title ?? "…"}
          </ThemedText>
          <View style={styles.headerSubRow}>
            <ModelStatusBar onPress={initContext} />
            {activeSession?.bookTitle && (
              <Touchable
                style={styles.bookChip}
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
                  color={colors.primary.default}
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
        style={styles.messageList}
        contentContainerStyle={styles.listContent}
        data={visibleMessages}
        keyExtractor={(item: ChatMessage) => item.id}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        renderItem={renderItem}
        ListFooterComponent={listFooter}
      />

      {/* Input bar */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.textInput}
          placeholder={
            !modelDownloaded
              ? "Set up Samwell in Settings…"
              : samwellMode === 'cloud' && !cloudBaseUrl
                ? "Cloud unavailable in this build…"
              : !modelReady
                ? "Wake up Samwell…"
                : "Message Samwell…"
          }
          placeholderTextColor={colors.text.secondary}
          value={inputText}
          onChangeText={setInputText}
          multiline
          editable={modelReady && !isGenerating}
          onSubmitEditing={handleSend}
        />

        {isGenerating ? (
          <Touchable
            style={[styles.stopBtn, isStopping && { opacity: 0.5 }]}
            disabled={isStopping}
            onPress={() => {
              setIsStopping(true);
              stopGeneration();
            }}
          >
            <Square
              size={16}
              color={colors.text.primary}
              fill={colors.text.primary}
            />
          </Touchable>
        ) : (
          <Touchable
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!canSend}
          >
            <Send
              size={16}
              color={canSend ? colors.text.inverse : colors.text.secondary}
            />
          </Touchable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
