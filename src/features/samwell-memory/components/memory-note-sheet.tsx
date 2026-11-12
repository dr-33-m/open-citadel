import React from 'react';
import { View } from 'react-native';

import { MessageSquare, Pencil, Trash2, type LucideIcon } from '@/components/icons';
import { MenuList } from '@/components/menu-list';
import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';
import { fontFamily } from '@/constants/theme';
import { memoryMenu, type MemoryAction, type MemoryTarget } from '@/features/samwell-memory/utils/memory-rows';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

const ICONS: Record<MemoryAction, LucideIcon> = {
  correct: Pencil,
  chat: MessageSquare,
  forget: Trash2,
};

const SERIF = { fontFamily: fontFamily.serif } as const;

type MemoryNoteSheetProps = {
  visible: boolean;
  target: MemoryTarget | null;
  onClose: () => void;
  onAction: (action: MemoryAction, target: MemoryTarget) => void;
};

/**
 * What can be done with one thing he kept: put it right, go back to the chat
 * it came from, or have him forget it. The note itself heads the sheet, so it
 * is plain which one is being acted on.
 */
export function MemoryNoteSheet({ visible, target, onClose, onAction }: MemoryNoteSheetProps) {
  const tokens = useThemeTokens();
  // Held content through the close: the shell keeps the last children while
  // it animates away, so this renders nothing rather than unmounting.
  if (!target) return <Sheet visible={visible} onClose={onClose}>{null}</Sheet>;

  const select = (action: MemoryAction) => {
    onClose();
    onAction(action, target);
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View className="gap-4">
        <View className="gap-1 px-4">
          <ThemedText type="bodyMd" style={SERIF} numberOfLines={4}>
            {target.text}
          </ThemedText>
          <ThemedText type="labelSm" color={tokens['--color-muted-foreground']} numberOfLines={1}>
            {target.meta}
          </ThemedText>
        </View>
        <MenuList rows={memoryMenu(target)} icons={ICONS} onSelect={select} />
      </View>
    </Sheet>
  );
}
