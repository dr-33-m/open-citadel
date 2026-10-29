import React from 'react';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/** "12 EPISODES": how many a page search found, at the head of its results. */
export function SearchResultsHead({ count }: { count: string }) {
  const tokens = useThemeTokens();
  return (
    <ThemedText type="labelSm" color={tokens['--color-muted-foreground']} className="px-6 pb-2 pt-1">
      {count}
    </ThemedText>
  );
}
