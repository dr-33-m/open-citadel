import React from 'react';

import { ListMusic } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { iconSize } from '@/constants/theme';
import { PlayerTool, TOOL_VALUE } from '@/features/podcasts/components/player-tool';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/** Up Next in the player's row of tools, with its count when there is one. */
export function UpNextTool({ count, onPress }: { count: number; onPress: () => void }) {
  const muted = useThemeTokens()['--color-muted-foreground'];
  return (
    <PlayerTool label={count > 0 ? `Up Next, ${count}` : 'Up Next'} onPress={onPress}>
      <ListMusic size={iconSize.default} color={muted} />
      {count > 0 ? (
        <ThemedText color={muted} style={TOOL_VALUE}>
          {count}
        </ThemedText>
      ) : null}
    </PlayerTool>
  );
}
