import React from 'react';
import { View } from 'react-native';

import { BookOpen, MessageSquarePlus, MicSignal, Newspaper } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Item } from '@/components/ui/item';
import { PrefixIcon } from '@/components/ui/prefix-icon';
import { Spinner } from '@/components/ui/spinner';
import type { ChatSession } from '@/services/chat-sessions';

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

/** What a past chat says: its kind, its name, how long ago, the last words. */
export function ChatHistoryRowBody({
  item,
  opening = false,
  primary,
  muted,
}: {
  item: ChatSession;
  /** This chat is being opened: a spinner where its icon was. */
  opening?: boolean;
  primary: string;
  muted: string;
}) {
  // What the chat is about: a podcast episode, a blog post, a book, or nothing in particular.
  const kindIcon =
    item.bookKind === 'episode'
      ? MicSignal
      : item.bookKind === 'article'
        ? Newspaper
        : item.bookTitle
          ? BookOpen
          : MessageSquarePlus;

  return (
    <>
      <Item.Media>
        {opening ? (
          <View className="h-10 w-10 items-center justify-center">
            <Spinner size="sm" />
          </View>
        ) : (
          <PrefixIcon icon={kindIcon} />
        )}
      </Item.Media>
      <Item.Content>
        <View className="flex-row items-start justify-between gap-2">
          <Item.Title className="flex-1" numberOfLines={1}>
            {item.title}
          </Item.Title>
          <ThemedText type="labelSm" color={muted}>
            {timeAgo(item.updatedAt)}
          </ThemedText>
        </View>
        {item.bookTitle ? (
          <ThemedText type="labelSm" color={primary}>
            {item.bookTitle}
          </ThemedText>
        ) : null}
        {item.lastMessage ? <Item.Description numberOfLines={1}>{item.lastMessage}</Item.Description> : null}
      </Item.Content>
    </>
  );
}
