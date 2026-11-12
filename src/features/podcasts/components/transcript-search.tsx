import React from 'react';
import { View } from 'react-native';

import { ChevronDown, ChevronUp } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { SearchBar } from '@/components/ui/search-bar';
import { Touchable } from '@/components/ui/touchable';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type TranscriptSearchProps = {
  onChange: (query: string) => void;
  /** "4 of 12", "No matches", or null before a search. */
  label: string | null;
  onNext: () => void;
  onPrev: () => void;
};

/** The transcript's search: the field, how many lines match, and up and down between them. */
export function TranscriptSearch({ onChange, label, onNext, onPrev }: TranscriptSearchProps) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];
  const stepping = label != null && label !== 'No matches';
  return (
    <View className="flex-row items-center gap-2">
      <View className="flex-1">
        <SearchBar variant="filled" placeholder="Search the transcript…" onChangeText={onChange} />
      </View>
      {label ? (
        <ThemedText type="labelSm" color={muted} style={{ fontVariant: ['tabular-nums'] }}>
          {label}
        </ThemedText>
      ) : null}
      {stepping ? (
        <>
          <Touchable className="h-10 w-8 items-center justify-center" onPress={onPrev} haptic="select" accessibilityRole="button" accessibilityLabel="Previous match">
            <ChevronUp size={18} color={tokens['--color-primary']} />
          </Touchable>
          <Touchable className="h-10 w-8 items-center justify-center" onPress={onNext} haptic="select" accessibilityRole="button" accessibilityLabel="Next match">
            <ChevronDown size={18} color={tokens['--color-primary']} />
          </Touchable>
        </>
      ) : null}
    </View>
  );
}
