import React from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { MemoryNoteRow } from '@/features/samwell-memory/components/memory-note-row';
import type { MemoryNoteView } from '@/features/samwell-memory/utils/memory-rows';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type MemorySectionProps = {
  title: string;
  notes: MemoryNoteView[];
  onOpen: (note: MemoryNoteView) => void;
};

/** One kind of note under its label, the notes together on one card with hairlines between. */
export const MemorySection = React.memo(function MemorySection({ title, notes, onOpen }: MemorySectionProps) {
  const tokens = useThemeTokens();

  return (
    <View className="gap-2 pt-8">
      <ThemedText type="labelSm" color={tokens['--color-muted-foreground']}>
        {title}
      </ThemedText>
      <Card>
        {notes.map((note, index) => (
          <React.Fragment key={note.id}>
            {index > 0 ? <View className="h-px bg-border" /> : null}
            <MemoryNoteRow note={note} onOpen={onOpen} />
          </React.Fragment>
        ))}
      </Card>
    </View>
  );
});
