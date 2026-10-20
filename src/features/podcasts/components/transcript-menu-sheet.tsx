import React from 'react';

import { BookOpen, Copy, Pencil, ZodiacPisces, type LucideIcon } from '@/components/icons';
import { MenuList } from '@/components/menu-list';
import { Sheet } from '@/components/ui/sheet';
import type { TranscriptMenuKey } from '@/features/podcasts/hooks/use-transcript-actions';

const ICONS: Record<TranscriptMenuKey, LucideIcon> = { ask: ZodiacPisces, copy: Copy, rename: Pencil, reader: BookOpen };

type TranscriptMenuSheetProps = {
  visible: boolean;
  rows: { key: TranscriptMenuKey; label: string }[];
  onClose: () => void;
  onSelect: (key: TranscriptMenuKey) => void;
};

/** A long-pressed transcript line: ask Samwell about it, copy it, rename its speaker, or read it in the reader. Over the transcript sheet. */
export function TranscriptMenuSheet({ visible, rows, onClose, onSelect }: TranscriptMenuSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} stackBehavior="push">
      <MenuList rows={rows} icons={ICONS} onSelect={onSelect} />
    </Sheet>
  );
}
