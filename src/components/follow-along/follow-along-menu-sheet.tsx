import React from 'react';

import { Copy, Highlighter, Pencil, ScrollText, ZodiacPisces, type LucideIcon } from '@/components/icons';
import { MenuList } from '@/components/menu-list';
import { Sheet } from '@/components/ui/sheet';

/** What a long-pressed row can do: each kind offers the ones it has. */
export type FollowAlongMenuKey = 'highlight' | 'ask' | 'copy' | 'rename' | 'reader';

const ICONS: Record<FollowAlongMenuKey, LucideIcon> = {
  highlight: Highlighter,
  ask: ZodiacPisces,
  copy: Copy,
  rename: Pencil,
  reader: ScrollText,
};

type FollowAlongMenuSheetProps = {
  visible: boolean;
  rows: { key: FollowAlongMenuKey; label: string }[];
  onClose: () => void;
  onSelect: (key: FollowAlongMenuKey) => void;
};

/**
 * A long-pressed row of a follow-along sheet (a transcript's line, a book's
 * sentence): highlight it, ask Samwell about it, copy it, and whatever else
 * its kind offers. Over the follow-along sheet, which stays beneath it.
 */
export function FollowAlongMenuSheet({ visible, rows, onClose, onSelect }: FollowAlongMenuSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} stackBehavior="push">
      <MenuList rows={rows} icons={ICONS} onSelect={onSelect} />
    </Sheet>
  );
}
