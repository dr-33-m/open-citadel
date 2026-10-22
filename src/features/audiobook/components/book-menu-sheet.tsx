import React from 'react';
import { View } from 'react-native';

import { BookOpen, CircleX } from '@/components/icons';
import { MenuList } from '@/components/menu-list';
import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';
import { bookPlayerMenu, type BookPlayerAction } from '@/features/audiobook/utils/player-menu';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

const ICONS = { read: BookOpen, stop: CircleX };
const ROWS = bookPlayerMenu();

type BookMenuSheetProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSelect: (action: BookPlayerAction) => void;
};

/** The player's menu for a book. Every row closes it. */
export function BookMenuSheet({ visible, title, onClose, onSelect }: BookMenuSheetProps) {
  const muted = useThemeTokens()['--color-muted-foreground'];
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
        <MenuList rows={ROWS} icons={ICONS} onSelect={select} />
      </View>
    </Sheet>
  );
}
