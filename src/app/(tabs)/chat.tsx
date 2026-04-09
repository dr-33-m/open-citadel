import { useRouter } from 'expo-router';
import { MessageSquarePlus, Bot } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookPickerSheet } from '@/components/chat/book-picker-sheet';
import { ThemedText } from '@/components/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { useChatStore, type ChatSession } from '@/stores/chat';
import { useLlamaStore } from '@/stores/llama';

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ChatTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { sessions, loadSessions, createSession, deleteSession } = useChatStore();
  const { models, activeModelId } = useLlamaStore();
  const [bookPickerVisible, setBookPickerVisible] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ChatSession | null>(null);

  const activeModel = models.find((m) => m.id === activeModelId);
  const hasModel = activeModel?.isDownloaded ?? false;

  useEffect(() => {
    loadSessions();
  }, []);

  async function handleNewChat() {
    setBookPickerVisible(true);
  }

  async function handleBookSelected(bookId: string, bookTitle: string) {
    setBookPickerVisible(false);
    const sessionId = await createSession({ bookId, title: bookTitle });
    router.push({ pathname: '/chat/[id]', params: { id: sessionId } });
  }

  async function handleNewChatNoBook() {
    setBookPickerVisible(false);
    const sessionId = await createSession({ title: 'New chat' });
    router.push({ pathname: '/chat/[id]', params: { id: sessionId } });
  }

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface.base },
    headerWrap: { paddingTop: insets.top },
    sessionItem: {
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[3],
      borderBottomWidth: 1,
      borderBottomColor: colors.outline.variant,
    },
    sessionTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 2,
    },
    bookChip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing[8],
      gap: spacing[3],
    },
    emptyIcon: { opacity: 0.3 },
    settingsLink: {
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[2],
      borderWidth: 1,
      borderColor: colors.primary.default,
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[2],
      paddingHorizontal: spacing[3],
      paddingVertical: spacing[2],
      backgroundColor: colors.surface.mid,
    },
  });

  function renderEmpty() {
    if (!hasModel) {
      return (
        <View style={styles.emptyContainer}>
          <Bot size={48} color={colors.text.secondary} style={styles.emptyIcon} />
          <ThemedText type="headlineSm" color={colors.text.secondary}>No AI model yet</ThemedText>
          <ThemedText type="bodySm" color={colors.text.secondary} style={{ textAlign: 'center' }}>
            Download a model in Settings to start chatting about your books.
          </ThemedText>
          <Pressable style={styles.settingsLink} onPress={() => router.push({ pathname: '/settings' })}>
            <ThemedText type="labelMd" color={colors.primary.default}>GO TO SETTINGS</ThemedText>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <MessageSquarePlus size={48} color={colors.text.secondary} style={styles.emptyIcon} />
        <ThemedText type="headlineSm" color={colors.text.secondary}>No chats yet</ThemedText>
        <ThemedText type="bodySm" color={colors.text.secondary} style={{ textAlign: 'center' }}>
          Start a new chat or tap a highlight in the reader to discuss a passage.
        </ThemedText>
      </View>
    );
  }

  const renderSession = useCallback(({ item }: { item: ChatSession }) => {
    return (
      <Pressable
        style={styles.sessionItem}
        onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}
        onLongPress={() => setConfirmDelete(item)}
      >
        <View style={styles.sessionTop}>
          <ThemedText type="bodyMd" style={{ flex: 1, marginRight: spacing[2] }} numberOfLines={1}>
            {item.title}
          </ThemedText>
          <ThemedText type="labelSm" color={colors.text.secondary}>
            {timeAgo(item.updatedAt)}
          </ThemedText>
        </View>
        {item.bookTitle && (
          <View style={styles.bookChip}>
            <ThemedText type="labelSm" color={colors.primary.default}>{item.bookTitle}</ThemedText>
          </View>
        )}
        {item.lastMessage && (
          <ThemedText type="bodySm" color={colors.text.secondary} numberOfLines={1}>
            {item.lastMessage}
          </ThemedText>
        )}
      </Pressable>
    );
  }, [styles, colors, router]);

  return (
    <View style={styles.container}>
      <View style={styles.headerWrap}>
        <ScreenHeader
          title="Chats"
          rightIcon={<MessageSquarePlus size={22} color={colors.primary.default} />}
          onRightPress={handleNewChat}
        />
      </View>

      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={renderSession}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={sessions.length === 0 ? { flex: 1 } : undefined}
      />

      <BookPickerSheet
        visible={bookPickerVisible}
        onSelect={handleBookSelected}
        onSkip={handleNewChatNoBook}
        onClose={() => setBookPickerVisible(false)}
      />

      <Modal
        visible={confirmDelete !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setConfirmDelete(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}
          onPress={() => setConfirmDelete(null)}
        >
          <Pressable
            style={{ backgroundColor: colors.surface.low, padding: spacing[5], width: '80%', gap: spacing[4] }}
            onPress={() => {}}
          >
            <ThemedText type="headlineSm">Delete chat?</ThemedText>
            <ThemedText type="bodySm" color={colors.text.secondary} numberOfLines={2}>
              {confirmDelete?.title}
            </ThemedText>
            <View style={{ flexDirection: 'row', gap: spacing[3], justifyContent: 'flex-end' }}>
              <Pressable style={styles.actionBtn} onPress={() => setConfirmDelete(null)}>
                <ThemedText type="labelSm" color={colors.text.secondary}>CANCEL</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, { backgroundColor: '#e53935' }]}
                onPress={() => {
                  if (confirmDelete) deleteSession(confirmDelete.id);
                  setConfirmDelete(null);
                }}
              >
                <ThemedText type="labelSm" color="#fff">DELETE</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
