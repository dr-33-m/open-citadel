import { BookOpen, MessageSquarePlus, Trash2 } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Item } from '@/components/ui/item';
import { PrefixIcon } from '@/components/ui/prefix-icon';
import { Sheet } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Swipe, useSwipeGroup } from '@/components/ui/swipe';
import { asColor } from '@/utils/colors';
import { cn } from '@/lib/cn';
import type { ChatSession } from '@/stores/chat';

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

const FILL: { flex: 1 } = { flex: 1 };

/** Hairline between rows — `Item.Separator` in the list's separator slot. */
function RowSeparator() {
  return <Item.Separator />;
}

/**
 * Chat history: past chats, swipe-to-delete, new chat on top.
 *
 * Fixed height for the same reason as the book picker — the list is the whole
 * sheet, so letting it size to content moves every control somewhere different
 * on each open. The list is `Sheet.FlatList`, so a drag on the rows scrolls
 * and a drag at the top of the list hands back to the sheet.
 */
export function ChatHistorySheet({
  visible,
  sessions,
  switching,
  onSelect,
  onRequestDelete,
  onNewChat,
  onClose,
}: {
  visible: boolean;
  sessions: ChatSession[];
  /** Non-null while a switch (to this id, or 'new') is in flight — switching
   * does its own slow engine work (re-title the outgoing session, re-prime
   * the incoming one), so rows stay open and disabled with a spinner rather
   * than the sheet just closing and leaving the user unsure anything is
   * happening. */
  switching: 'new' | string | null;
  onSelect: (id: string) => void;
  /** Swipe a session row to its Delete action (tile tap or full swipe).
   * Confirmation is the caller's to show. */
  onRequestDelete: (session: ChatSession) => void;
  onNewChat: () => void;
  onClose: () => void;
}) {
  const [primary, mutedForeground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
  ]);

  return (
    <Sheet visible={visible} onClose={onClose} fixedHeightRatio={0.75}>
      <View className="px-6 pb-6">
        <ThemedText type="headlineSm">Past chats</ThemedText>
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
          <Item.Title>New chat</Item.Title>
        </Item.Content>
      </Item>

      {/* `flex-1` on the group, not just the list: the group renders a plain
          auto-height View, and a `flex:1` list inside an auto-height parent
          has nothing to grow into — the list measures 0 and the sheet renders
          its title and the New chat row over empty space. The group is the
          sheet body's fill child, so flexing it hands the remaining height
          down to the list. */}
      <Swipe.Group className="flex-1">
        <SessionList
          sessions={sessions}
          switching={switching}
          onSelect={onSelect}
          onRequestDelete={onRequestDelete}
          primary={asColor(primary) ?? ''}
          muted={asColor(mutedForeground) ?? ''}
        />
      </Swipe.Group>
    </Sheet>
  );
}

/**
 * The swipeable session rows. Split out so `useSwipeGroup` can read the
 * `Swipe.Group` above it — the hook has to be called from below the group.
 */
function SessionList({
  sessions,
  switching,
  onSelect,
  onRequestDelete,
  primary,
  muted,
}: {
  sessions: ChatSession[];
  switching: 'new' | string | null;
  onSelect: (id: string) => void;
  onRequestDelete: (session: ChatSession) => void;
  primary: string;
  muted: string;
}) {
  const { closeAll } = useSwipeGroup();

  // Stable renderItem + memoized rows: a scroll or a `switching` flip
  // reconciles only the rows whose props actually changed, not every
  // mounted cell.
  const renderItem = React.useCallback(
    ({ item }: { item: ChatSession }) => (
      <SessionRow
        item={item}
        switching={switching}
        onSelect={onSelect}
        onRequestDelete={onRequestDelete}
        primary={primary}
        muted={muted}
      />
    ),
    [switching, onSelect, onRequestDelete, primary, muted],
  );

  return (
    <Sheet.FlatList
      style={FILL}
      data={sessions}
      keyExtractor={(item) => item.id}
      // `switching` is read inside renderItem but lives outside the
      // data, so rows would keep their old dimming without this.
      extraData={switching}
      // Rows dragged aside are put back the moment a scroll begins — the
      // group's documented recipe for a list that scrolls, and half of
      // recycling safety: a row left open must never ride along into a
      // reused cell.
      onScrollBeginDrag={closeAll}
      ItemSeparatorComponent={RowSeparator}
      renderItem={renderItem}
    />
  );
}

const SessionRow = React.memo(function SessionRow({
  item,
  switching,
  onSelect,
  onRequestDelete,
  primary,
  muted,
}: {
  item: ChatSession;
  switching: 'new' | string | null;
  onSelect: (id: string) => void;
  onRequestDelete: (session: ChatSession) => void;
  primary: string;
  muted: string;
}) {
  return (
    <Swipe haptics>
      <Swipe.End>
        <Swipe.Action
          icon={<Trash2 />}
          label="Delete"
          color="destructive"
          onPress={() => onRequestDelete(item)}
        />
      </Swipe.End>
      <Item
        // Set on every branch, never conditionally omitted: a recycled
        // cell keeps the style of whatever row it held before, so a
        // dropped `opacity` leaves an unrelated row dimmed.
        className={cn('py-3', switching && switching !== item.id ? 'opacity-40' : 'opacity-100')}
        onPress={switching ? undefined : () => onSelect(item.id)}
      >
        <Item.Media>
          {switching === item.id ? (
            <View className="h-10 w-10 items-center justify-center">
              <Spinner size="sm" />
            </View>
          ) : (
            <PrefixIcon icon={item.bookTitle ? BookOpen : MessageSquarePlus} />
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
          {item.bookTitle && (
            <ThemedText type="labelSm" color={primary}>
              {item.bookTitle}
            </ThemedText>
          )}
          {item.lastMessage && <Item.Description numberOfLines={1}>{item.lastMessage}</Item.Description>}
        </Item.Content>
      </Item>
    </Swipe>
  );
});
