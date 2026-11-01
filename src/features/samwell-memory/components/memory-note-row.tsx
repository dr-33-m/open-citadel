import React from 'react';
import { View } from 'react-native';

import { IconButton } from '@/components/icon-button';
import { Trash2 } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { formatPubDate } from '@/utils/pub-date';

type MemoryNoteRowProps = {
  id: string;
  text: string;
  createdAt: string;
  closed: boolean;
  onForget: (id: string) => void;
};

/** One thing he wrote down: its words, when, and the way to delete it. */
export const MemoryNoteRow = React.memo(function MemoryNoteRow({ id, text, createdAt, closed, onForget }: MemoryNoteRowProps) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];
  const when = closed ? `${formatPubDate(createdAt)} · CLOSED` : formatPubDate(createdAt);

  return (
    <View className="flex-row items-start gap-3 py-3">
      <View className="flex-1 gap-1">
        <ThemedText type="bodyMd">{text}</ThemedText>
        <ThemedText type="labelSm" color={muted}>
          {when}
        </ThemedText>
      </View>
      <IconButton onPress={() => onForget(id)} label="Delete this note">
        <Trash2 size={16} color={muted} strokeWidth={2} />
      </IconButton>
    </View>
  );
});
