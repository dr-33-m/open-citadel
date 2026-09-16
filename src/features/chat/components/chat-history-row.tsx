import React from 'react';
import { View } from 'react-native';

import { BookOpen, MessageSquarePlus, PencilSparkles, Trash2 } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Item } from '@/components/ui/item';
import { PrefixIcon } from '@/components/ui/prefix-icon';
import { Spinner } from '@/components/ui/spinner';
import { Swipe, type SwipeHandle } from '@/components/ui/swipe';
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
