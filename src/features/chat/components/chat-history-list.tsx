import React from 'react';
import type { FlashListRef } from '@shopify/flash-list';
import { LayoutAnimation } from 'react-native';

import { PageFade } from '@/components/scroll-fades';
import { Item } from '@/components/ui/item';
import { Sheet } from '@/components/ui/sheet';
import { useSwipeGroup } from '@/components/ui/swipe';
import { ChatHistoryRow } from '@/features/chat/components/chat-history-row';
import { useArmedOnSettle } from '@/features/chat/hooks/use-armed-on-settle';
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
 * The past chats in the History sheet. Its own component so `useSwipeGroup`
 * can read the `Swipe.Group` above it: the hook has to be called from below
 * the group. Rows come up plain and gain their swipe once the sheet has
 * landed (`useArmedOnSettle`).
 */
export function ChatHistoryList({
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
  const armed = useArmedOnSettle();
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
        armed={armed}
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
    [armed, switching, renamingId, onSelect, deleteWithReflow, onRename, primary, muted, ink, onPrimary],
  );
  // Both are read inside renderItem but live outside the data, so rows would
  // keep a stale dimming or spinner without this.
  const extraData = React.useMemo(
    () => ({ armed, switching, renamingId }),
    [armed, switching, renamingId],
  );

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
