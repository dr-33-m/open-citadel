import React from 'react';

import { Copy, Eraser, Highlighter, Pencil, Play, ScrollText, Share, ZodiacPisces, type LucideIcon } from '@/components/icons';
import { MenuList } from '@/components/menu-list';
import { Sheet } from '@/components/ui/sheet';
import type { TranscriptMenuKey } from '@/features/podcasts/hooks/use-transcript-actions';

const ICONS: Record<TranscriptMenuKey, LucideIcon> = {
  play: Play,
  share: Share,
  highlight: Highlighter,
  unhighlight: Eraser,
  ask: ZodiacPisces,
  copy: Copy,
  rename: Pencil,
  reader: ScrollText,
};

type TranscriptMenuSheetProps = {
  visible: boolean;
  rows: { key: TranscriptMenuKey; label: string }[];
  onClose: () => void;
  onSelect: (key: TranscriptMenuKey) => void;
};

/**
 * A long-pressed transcript line (highlight it, ask Samwell about it, copy
 * it, rename its speaker, read it in the reader), or a long-pressed kept
 * highlight (play from it, ask, share it as an image, remove it). Pushed over
 * the sheet it was pressed in.
 */
export function TranscriptMenuSheet({ visible, rows, onClose, onSelect }: TranscriptMenuSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} stackBehavior="push">
      <MenuList rows={rows} icons={ICONS} onSelect={onSelect} />
    </Sheet>
  );
}
