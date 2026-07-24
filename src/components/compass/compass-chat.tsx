import { ChevronLeft, RotateCcw, Send } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CompassChatMessage } from 'samwell-shared';

import { ChatBubble } from '@/components/chat/chat-bubble';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { spacing, typography } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

type CompassChatProps = {
  title: string;
  opener: string;
  messages: CompassChatMessage[];
  submitting: boolean;
  finalizing?: boolean;
  draftCard?: React.ReactNode;
  placeholder: string;
  error?: string | null;
  onSend: (text: string) => void;
  onRetry?: () => void;
  onBack: () => void;
  inputRef?: React.RefObject<TextInput | null>;
};

export function CompassChat({
  title,
  opener,
  messages,
  submitting,
  finalizing,
  draftCard,
  placeholder,
  error,
  onSend,
  onRetry,
  onBack,
  inputRef,
}: CompassChatProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [text, setText] = React.useState('');
  const scrollRef = React.useRef<ScrollView>(null);

  const busy = submitting || finalizing;

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.surface.base, paddingTop: insets.top },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing[4],
          paddingVertical: spacing[3],
        },
        backButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
        headerTitle: { flex: 1, textAlign: 'center', marginRight: 32 },
        scrollFlex: { flex: 1 },
        scroll: { paddingVertical: spacing[3], gap: spacing[1] },
        thinking: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[3],
          paddingHorizontal: spacing[4],
          paddingVertical: spacing[3],
        },
        draftWrap: { paddingHorizontal: spacing[4], paddingVertical: spacing[2] },
        errorRow: {
          paddingHorizontal: spacing[4],
          paddingVertical: spacing[2],
          gap: spacing[2],
          alignItems: 'flex-start',
        },
        errorText: { color: '#e53935' },
        retryBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[1],
          paddingVertical: spacing[1],
        },
        inputRow: {
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: spacing[2],
          paddingHorizontal: spacing[4],
          paddingTop: spacing[2],
          paddingBottom: insets.bottom + spacing[2],
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.outline.variant,
        },
        input: {
          ...typography.bodyMd,
          flex: 1,
          color: colors.text.primary,
          backgroundColor: colors.surface.low,
          borderWidth: 1,
          borderColor: colors.outline.variant,
          paddingHorizontal: spacing[3],
          paddingVertical: spacing[2],
          minHeight: 48,
          maxHeight: 120,
        },
        sendButton: {
          width: 48,
          height: 48,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primary.default,
        },
        sendDisabled: { backgroundColor: colors.surface.highest },
      }),
    [colors, insets],
  );

  function handleSend() {
    const trimmed = text.trim();
    if (trimmed.length === 0 || busy) return;
    setText('');
    onSend(trimmed);
  }

  const canSend = text.trim().length > 0 && !busy;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <Touchable onPress={onBack} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text.primary} />
        </Touchable>
        <ThemedText type="headlineSm" style={styles.headerTitle}>
          {title}
        </ThemedText>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scrollFlex}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        <ChatBubble role="assistant" content={opener} />
        {messages.map((message, i) => (
          <ChatBubble key={i} role={message.role} content={message.content} />
        ))}

        {submitting && (
          <View style={styles.thinking}>
            <ActivityIndicator color={colors.primary.default} />
            <ThemedText type="labelMd" color={colors.text.secondary}>
              GRAND MAESTER SAMWELL IS THINKING…
            </ThemedText>
          </View>
        )}

        {draftCard != null && <View style={styles.draftWrap}>{draftCard}</View>}

        {error != null && (
          <View style={styles.errorRow}>
            <ThemedText type="bodySm" style={styles.errorText}>
              {error}
            </ThemedText>
            {onRetry && !submitting && (
              <Touchable style={styles.retryBtn} onPress={onRetry}>
                <RotateCcw size={16} color={colors.primary.default} />
                <ThemedText type="labelSm" color={colors.primary.default}>
                  RETRY
                </ThemedText>
              </Touchable>
            )}
          </View>
        )}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          multiline
          placeholder={placeholder}
          placeholderTextColor={colors.text.secondary}
          value={text}
          onChangeText={setText}
          editable={!finalizing}
        />
        <Touchable
          onPress={handleSend}
          style={[styles.sendButton, !canSend && styles.sendDisabled]}
        >
          <Send size={20} color={canSend ? colors.text.inverse : colors.text.secondary} />
        </Touchable>
      </View>
    </KeyboardAvoidingView>
  );
}
