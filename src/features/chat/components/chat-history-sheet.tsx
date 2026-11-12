import { MessageSquarePlus } from '@/components/icons';
import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { ChatHistoryList } from '@/features/chat/components/chat-history-list';
import { ChatHistorySkeleton } from '@/features/chat/components/chat-history-skeleton';
import { Item } from '@/components/ui/item';
import { PrefixIcon } from '@/components/ui/prefix-icon';
import { Sheet } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Swipe } from '@/components/ui/swipe';
import { asColor } from '@/utils/colors';
import { cn } from '@/lib/cn';
import type { ChatSession } from '@/stores/chat';

/**
 * Chat history: past chats, swipe right to rename and left to delete, new chat
 * on top.
 *
 * Fixed height for the same reason as the book picker — the list is the whole
 * sheet, so letting it size to content moves every control somewhere different
 * on each open. The list is `Sheet.FlatList`, so a drag on the rows scrolls
 * and a drag at the top of the list hands back to the sheet.
 */
export function ChatHistorySheet({
  visible,
  sessions,
  heading = 'Past chats',
  newLabel = 'New chat',
  switching,
  renamingId,
  onSelect,
  onDelete,
  onRename,
  onNewChat,
  onClose,
}: {
  visible: boolean;
  sessions: ChatSession[];
  /** What this history is of. Compass keeps its own list of the same shape,
   *  and calling both "chats" would blur the only line between them. */
  heading?: string;
  newLabel?: string;
  /** Non-null while a switch (to this id, or 'new') is in flight — switching
   * does its own slow engine work (priming the incoming one), so rows stay open and disabled with a spinner rather
   * than the sheet just closing and leaving the user unsure anything is
   * happening. */
  switching: 'new' | string | null;
  /** The session whose rename is running, if any. See `useSwipeRename`. */
  renamingId: string | null;
  onSelect: (id: string) => void;
  /** A full swipe or the Delete tile. Deletes at once: the swipe's reach
   * point, felt as a knock, is the confirmation. */
  onDelete: (session: ChatSession) => void;
  /** The Rename tile. Settles either way, and the row closes when it does. */
  onRename: (session: ChatSession) => Promise<void>;
  onNewChat: () => void;
  onClose: () => void;
}) {
  const [primary, mutedForeground, foreground, primaryForeground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
    '--color-foreground',
    '--color-primary-foreground',
  ]);

  return (
    <Sheet visible={visible} onClose={onClose} fixedHeightRatio={0.75}>
      <View className="px-6 pb-6">
        <ThemedText type="headlineSm">{heading}</ThemedText>
      </View>

      <Item
        // Set on every branch, never conditionally omitted: a recycled
        // cell keeps the style of whatever row it held before, so a
        // dropped `opacity` leaves an unrelated row dimmed.
        className={cn('py-3', switching && switching !== 'new' ? 'opacity-40' : 'opacity-100')}
        onPress={switching ? undefined : onNewChat}
      >
        <Item.Media>
          {switching === 'new' ? (
            <View className="h-10 w-10 items-center justify-center">
              <Spinner size="sm" />
            </View>
          ) : (
            <PrefixIcon icon={MessageSquarePlus} color={asColor(primary)} />
          )}
        </Item.Media>
        <Item.Content>
          <Item.Title>{newLabel}</Item.Title>
        </Item.Content>
      </Item>

      {/* The list mounts once the sheet has landed, behind rows of skeleton.
          Mounted with the sheet, its measuring passes held the rise back
          250-400ms after the tap. Mounted as the rise began, it cost the rise
          no JS time, but iOS creates the rows' views on the main thread, the
          one the spring runs on: a dropped frame just as the sheet slowed to
          arrive, so it seemed to stop short (4 opens in 6, iOS dev build;
          none once the list waited).

          `flex-1` on the group, not just the list: the group renders a plain
          auto-height View, and a `flex:1` list inside an auto-height parent
          has nothing to grow into — the list measures 0 and the sheet renders
          its title and the New chat row over empty space. `Sheet.Deferred`
          fills what the sheet body leaves, so flexing the group inside it
          hands that height down to the list. */}
      <Sheet.Deferred skeleton={<ChatHistorySkeleton count={sessions.length} />}>
        <Swipe.Group className="flex-1">
          <ChatHistoryList
            sessions={sessions}
            switching={switching}
            renamingId={renamingId}
            onSelect={onSelect}
            onDelete={onDelete}
            onRename={onRename}
            primary={asColor(primary) ?? ''}
            muted={asColor(mutedForeground) ?? ''}
            ink={asColor(foreground) ?? ''}
            onPrimary={asColor(primaryForeground) ?? ''}
          />
        </Swipe.Group>
      </Sheet.Deferred>
    </Sheet>
  );
}
