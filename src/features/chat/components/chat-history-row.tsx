import React from 'react';

import { PencilSparkles, Trash2 } from '@/components/icons';
import { Item } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import { Swipe, type SwipeHandle } from '@/components/ui/swipe';
import { ChatHistoryRowBody } from '@/features/chat/components/chat-history-row-body';
import { cn } from '@/lib/cn';
import type { ChatSession } from '@/stores/chat';

export interface ChatHistoryRowProps {
  item: ChatSession;
  switching: 'new' | string | null;
  /** This row's rename is running: the tile shows a spinner and the row holds open. */
  renaming: boolean;
  onSelect: (id: string) => void;
  onDelete: (session: ChatSession) => void;
  /** Settles either way; the row closes when it does. */
  onRename: (session: ChatSession) => Promise<void>;
  primary: string;
  muted: string;
  /** The app's ink — the same colour a chat title is drawn in. */
  ink: string;
  /** Drawn on the primary fill of the Rename tile. */
  onPrimary: string;
}

/**
 * One past chat: tap to open, swipe right to rename, swipe left to delete.
 *
 * Each side has one action, and a swipe carried far enough runs it; a shorter
 * one leaves the tile showing to tap. Delete slides the row out, the reach
 * point being its confirmation. Rename holds the row open instead, with its
 * pencil turned into a spinner, and lets the row spring back once the name has
 * landed or failed.
 */
export const ChatHistoryRow = React.memo(function ChatHistoryRow({
  item,
  switching,
  renaming,
  onSelect,
  onDelete,
  onRename,
  primary,
  muted,
  ink,
  onPrimary,
}: ChatHistoryRowProps) {
  const swipeRef = React.useRef<SwipeHandle>(null);

  // A book chat is named after its book, which is how it is found again.
  const canRename = !item.bookId;
  // Not while switching: on device, opening a chat primes the same engine a
  // rename generates on.
  const renameDisabled = renaming || switching !== null;
  const dimmed = switching !== null && switching !== item.id;

  const handleRename = React.useCallback(() => {
    // The close runs against whichever row this cell shows by then. A cell
    // recycled mid-rename was already closed by the list's scroll, so closing
    // it again does nothing.
    void onRename(item).finally(() => swipeRef.current?.close());
  }, [onRename, item]);

  const renameIcon = renaming ? (
    // `size` set so the tile does not resize it as a glyph. The ring and its
    // arc are recoloured for the primary fill, where the default primary arc
    // would vanish.
    <Spinner size="md" className="border-primary-foreground/30 border-t-primary-foreground" />
  ) : (
    <PencilSparkles color={onPrimary} />
  );

  return (
    // Held still while renaming: a second drag would close the row the
    // spinner is being shown on, with the rename still running.
    <Swipe ref={swipeRef} haptics removeOnCommit disabled={renaming}>
      {canRename ? (
        <Swipe.Start>
          {/* `keepOpen` exempts it from `removeOnCommit`: a full swipe here
              holds the row open rather than sliding it out as a delete. */}
          <Swipe.Action
            icon={renameIcon}
            label={renaming ? 'Renaming' : 'Rename'}
            color="primary"
            keepOpen
            onPress={renameDisabled ? undefined : handleRename}
          />
        </Swipe.Start>
      ) : null}
      <Swipe.End>
        {/* Red tile, drawn on in the app's own ink — the colour a chat title
            uses — rather than the variant's white. The fill already carries
            the warning, so the marks on top only have to read against it, and
            white on red shouts twice.

            `color` on the icon survives: `sizeIcon` injects a size and nothing
            else, and lucide takes its colour from the prop rather than from
            the tile's IconColorProvider. */}
        <Swipe.Action
          icon={<Trash2 color={ink} />}
          label="Delete"
          color="destructive"
          labelClassName="text-foreground"
          onPress={() => onDelete(item)}
        />
      </Swipe.End>
      <Item
        // Set on every branch, never conditionally omitted: a recycled
        // cell keeps the style of whatever row it held before, so a
        // dropped `opacity` leaves an unrelated row dimmed.
        className={cn('py-3', dimmed ? 'opacity-40' : 'opacity-100')}
        onPress={switching ? undefined : () => onSelect(item.id)}
      >
        <ChatHistoryRowBody item={item} opening={switching === item.id} primary={primary} muted={muted} />
      </Item>
    </Swipe>
  );
});
