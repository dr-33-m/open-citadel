import React from 'react';
import { View } from 'react-native';

import { BookOpen, CircleX } from '@/components/icons';
import { MenuList } from '@/components/menu-list';
import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';
import { bookPlayerMenu, type BookPlayerAction } from '@/features/audiobook/utils/player-menu';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

const ICONS = { read: BookOpen, stop: CircleX };
const BOOK_ROWS = bookPlayerMenu(false);
const POST_ROWS = bookPlayerMenu(true);

type BookMenuSheetProps = {
  visible: boolean;
  title: string;
  /** A blog post rather than a book. */
  post: boolean;
  onClose: () => void;
  onSelect: (action: BookPlayerAction) => void;
};

/** The player's menu for a book. Every row closes it. */
export function BookMenuSheet({ visible, title, post, onClose, onSelect }: BookMenuSheetProps) {
  const muted = useThemeTokens()['--color-muted-foreground'];
  const rows = post ? POST_ROWS : BOOK_ROWS;
  const select = (action: BookPlayerAction) => {
    onClose();
    onSelect(action);
  };
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View className="gap-4">
        <ThemedText type="bodySm" color={muted} numberOfLines={1} className="px-4">
          {title}
        </ThemedText>
        <MenuList rows={rows} icons={ICONS} onSelect={select} />
      </View>
    </Sheet>
  );
}
