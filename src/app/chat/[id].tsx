import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Search, Send, Sparkles, Square } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChatBubble } from "@/components/chat/chat-bubble";
import { ModelStatusBar } from "@/components/chat/model-status-bar";
import { ThemedText } from "@/components/themed-text";
import { spacing } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import { useChatStore, type ChatMessage } from "@/stores/chat";
import { useLlamaStore } from "@/stores/llama";

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
    openSession,
    sendMessage,
    stopGeneration,
  } = useChatStore();
  const { isLoaded, isLoading, loadError, activeModelId, models, initContext } =
    useLlamaStore();

  const [inputText, setInputText] = useState("");
  const [isStopping, setIsStopping] = useState(false);
  const listRef = useRef<FlashListRef<ChatMessage>>(null);

  const activeModel = models.find((m) => m.id === activeModelId);
  const modelReady = isLoaded;
  const modelDownloaded = activeModel?.isDownloaded ?? false;

  useEffect(() => {
    if (id) openSession(id);
  }, [id]);

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
  useEffect(() => {
    if (isThinking || isToolCalling) {
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
  }, [isThinking, isToolCalling]);

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
    if (!isGenerating) return null;
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
    if (isThinking) return (
      <View style={{ flexDirection: 'row', justifyContent: 'flex-start', marginBottom: spacing[1], paddingHorizontal: spacing[4] }}>
        <View style={{ paddingVertical: spacing[2], paddingHorizontal: spacing[3], backgroundColor: colors.surface.mid, flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Animated.View style={{ opacity: pulseAnim }}>
            <Sparkles size={14} color={colors.primary.default} />
          </Animated.View>
          <ThemedText type="bodySm" color={colors.text.secondary}>Thinking…</ThemedText>
        </View>
      </View>
    );
    if (streamingContent) return (
      <ChatBubble
        role="assistant"
        content={streamingContent}
        streaming
        onNavigateToHighlight={handleNavigateToHighlight}
        onNavigateToTimeline={handleNavigateToTimeline}
      />
    );
    return (
      <View style={{ paddingHorizontal: spacing[4], paddingVertical: spacing[2] }}>
        <ActivityIndicator color={colors.text.secondary} />
      </View>
    );
  }, [isGenerating, isThinking, isToolCalling, toolCallStatus, streamingContent, pulseAnim, colors, handleNavigateToHighlight]);

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
    if (!modelDownloaded) {
      return (
        <View style={styles.banner}>
          <ThemedText type="bodySm" color={colors.text.secondary}>
            Samwell needs a model to run. Set one up in Settings.
          </ThemedText>
          <Pressable
            style={styles.loadBtn}
            onPress={() => router.push({ pathname: "/settings" })}
          >
            <ThemedText type="labelSm" color={colors.text.inverse}>
              SET UP SAMWELL
            </ThemedText>
          </Pressable>
        </View>
      );
    }

    if (loadError) {
      return (
        <View style={styles.banner}>
          <ThemedText type="bodySm" color="#e53935">
            {loadError}
          </ThemedText>
          <Pressable
            style={[styles.loadBtn, isLoading && { opacity: 0.5 }]}
            disabled={isLoading}
            onPress={initContext}
          >
            <ThemedText type="labelSm" color={colors.text.inverse}>
              RETRY
            </ThemedText>
          </Pressable>
        </View>
      );
    }

    if (!modelReady && !isLoading) {
      return (
        <View style={styles.banner}>
          <ThemedText type="bodySm" color={colors.text.secondary}>
            Samwell is offline. Wake him up to chat.
          </ThemedText>
          <Pressable
            style={[styles.loadBtn, isLoading && { opacity: 0.5 }]}
            disabled={isLoading}
            onPress={initContext}
          >
            <ThemedText type="labelSm" color={colors.text.inverse}>
              WAKE UP
            </ThemedText>
          </Pressable>
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
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color={colors.text.primary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <ThemedText type="bodyMd" numberOfLines={1}>
            {activeSession?.title ?? "…"}
          </ThemedText>
          <View style={styles.headerSubRow}>
            <ModelStatusBar onPress={initContext} />
            {activeSession?.bookTitle && (
              <Pressable
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
              </Pressable>
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
          <Pressable
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
          </Pressable>
        ) : (
          <Pressable
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!canSend}
          >
            <Send
              size={16}
              color={canSend ? colors.text.inverse : colors.text.secondary}
            />
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
