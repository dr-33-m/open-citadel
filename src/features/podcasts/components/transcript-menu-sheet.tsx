import React from 'react';

import { BookOpen, Copy, ZodiacPisces, type LucideIcon } from '@/components/icons';
import { MenuList } from '@/components/menu-list';
import { Sheet } from '@/components/ui/sheet';
import { TRANSCRIPT_MENU, type TranscriptMenuKey } from '@/features/podcasts/hooks/use-transcript-actions';

const ICONS: Record<TranscriptMenuKey, LucideIcon> = { ask: ZodiacPisces, copy: Copy, reader: BookOpen };

type TranscriptMenuSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (key: TranscriptMenuKey) => void;
};

/** A long-pressed transcript line: ask Samwell about it, copy it, or read it in the reader. Over the transcript sheet. */
export function TranscriptMenuSheet({ visible, onClose, onSelect }: TranscriptMenuSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} stackBehavior="push">
      <MenuList rows={TRANSCRIPT_MENU} icons={ICONS} onSelect={onSelect} />
    </Sheet>
  );
}
