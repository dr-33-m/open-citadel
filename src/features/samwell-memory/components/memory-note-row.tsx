import React from 'react';
import { View } from 'react-native';

import { Ellipsis } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { fontFamily } from '@/constants/theme';
import type { MemoryNoteView } from '@/features/samwell-memory/utils/memory-rows';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type MemoryNoteRowProps = {
  note: MemoryNoteView;
  onOpen: (note: MemoryNoteView) => void;
};

/** The words are content, so they are in the serif; the chrome around them is not. */
const SERIF = { fontFamily: fontFamily.serif } as const;

/**
 * One thing he wrote down: its words, when and from which chat, and a quiet
 * mark that says there is more to do with it. The whole row opens its sheet;
 * nothing here deletes anything on a single tap.
 */
export const MemoryNoteRow = React.memo(function MemoryNoteRow({ note, onOpen }: MemoryNoteRowProps) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];

  return (
    <Touchable
      onPress={() => onOpen(note)}
      accessibilityRole="button"
      accessibilityHint="Correct it, open the chat it came from, or forget it"
      className="flex-row items-start gap-3 p-4"
    >
      <View className="flex-1 gap-1">
        <ThemedText type="bodyMd" style={SERIF}>
          {note.text}
        </ThemedText>
        <ThemedText type="labelSm" color={muted} numberOfLines={1}>
          {note.meta}
        </ThemedText>
      </View>
      <Ellipsis size={16} color={muted} />
    </Touchable>
  );
});
