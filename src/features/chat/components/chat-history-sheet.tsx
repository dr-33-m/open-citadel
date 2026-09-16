import { MessageSquarePlus } from '@/components/icons';
import React from 'react';
import type { FlashListRef } from '@shopify/flash-list';
import { LayoutAnimation, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { PageFade } from '@/components/scroll-fades';
import { ChatHistoryRow } from '@/features/chat/components/chat-history-row';
import { Item } from '@/components/ui/item';
import { PrefixIcon } from '@/components/ui/prefix-icon';
import { Sheet } from '@/components/ui/sheet';
import { ChatHistorySkeleton } from '@/components/skeletons/chat-history-skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Swipe, useSwipeGroup } from '@/components/ui/swipe';
import { asColor } from '@/utils/colors';
import { cn } from '@/lib/cn';
import type { ChatSession } from '@/stores/chat';

const FILL: { flex: 1 } = { flex: 1 };

/**
 * The rows below a deleted chat moving up into its place.
 *
 * Core `LayoutAnimation` rather than a Reanimated layout transition, because
 * this list is FlashList and that is the path it documents: its cells are
 * positioned by the list, and `prepareForLayoutAnimationRender()` turns
 * recycling off for the render so the right cells move. The deleted row has
 * already slid out, so only `update` animates. On-screen movement: ease-in-out.
 */
const ROW_CLOSE = {
  duration: 220,
  update: { type: LayoutAnimation.Types.easeInEaseOut },
};

/** Hairline between rows — `Item.Separator` in the list's separator slot. */
function RowSeparator() {
  return <Item.Separator />;
}

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

      {/* `flex-1` on the group, not just the list: the group renders a plain
          auto-height View, and a `flex:1` list inside an auto-height parent
          has nothing to grow into — the list measures 0 and the sheet renders
          its title and the New chat row over empty space. The group is the
          sheet body's fill child, so flexing it hands the remaining height
          down to the list. */}
      {/* Every row here is a `Swipe` — a pan gesture and three animated styles
          apiece — so mounting the list is what the sheet's open used to wait
          on. The title and the New chat row above cost nothing and stay put. */}
      <Sheet.Deferred
        skeleton={<ChatHistorySkeleton />}
      >
      <Swipe.Group className="flex-1">
        <SessionList
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

/**
 * The swipeable session rows. Split out so `useSwipeGroup` can read the
 * `Swipe.Group` above it — the hook has to be called from below the group.
 */
function SessionList({
  sessions,
  switching,
  renamingId,
  onSelect,
  onDelete,
  onRename,
  primary,
  muted,
  ink,
  onPrimary,
}: {
  sessions: ChatSession[];
  switching: 'new' | string | null;
  renamingId: string | null;
  onSelect: (id: string) => void;
  onDelete: (session: ChatSession) => void;
  onRename: (session: ChatSession) => Promise<void>;
  primary: string;
  muted: string;
  ink: string;
  onPrimary: string;
}) {
  const { closeAll } = useSwipeGroup();
  const listRef = React.useRef<FlashListRef<ChatSession>>(null);

  // Runs once the row has slid out. The layout animation has to be armed
  // before the store drops the session, since it applies to the next commit.
  const deleteWithReflow = React.useCallback(
    (session: ChatSession) => {
      listRef.current?.prepareForLayoutAnimationRender();
      LayoutAnimation.configureNext(ROW_CLOSE);
      onDelete(session);
    },
    [onDelete],
  );

  // Stable renderItem + memoized rows: a scroll or a `switching` flip
  // reconciles only the rows whose props actually changed, not every
  // mounted cell.
  const renderItem = React.useCallback(
    ({ item }: { item: ChatSession }) => (
      <ChatHistoryRow
        item={item}
        switching={switching}
        // A boolean, not the id: a rename starting or ending re-renders the
        // one row it concerns, not every mounted row.
        renaming={renamingId === item.id}
        onSelect={onSelect}
        onDelete={deleteWithReflow}
        onRename={onRename}
        primary={primary}
        muted={muted}
        ink={ink}
        onPrimary={onPrimary}
      />
    ),
    [switching, renamingId, onSelect, deleteWithReflow, onRename, primary, muted, ink, onPrimary],
  );
  // Both are read inside renderItem but live outside the data, so rows would
  // keep a stale dimming or spinner without this.
  const extraData = React.useMemo(() => ({ switching, renamingId }), [switching, renamingId]);

  return (
    // `popover`: the fade has to resolve to the sheet's own ground, not the
    // page behind it, or it draws a band of the wrong shade along the edge.
    <PageFade edges="both" surface="popover">
      <Sheet.FlatList
        ref={listRef}
        style={FILL}
        data={sessions}
        keyExtractor={(item) => item.id}
        extraData={extraData}
        // Rows dragged aside are put back the moment a scroll begins — the
        // group's documented recipe for a list that scrolls, and half of
        // recycling safety: a row left open must never ride along into a
        // reused cell.
        onScrollBeginDrag={closeAll}
        ItemSeparatorComponent={RowSeparator}
        renderItem={renderItem}
      />
    </PageFade>
  );
}
