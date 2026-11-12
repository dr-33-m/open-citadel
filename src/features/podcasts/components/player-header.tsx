import React from 'react';

import { ChevronDown, Ellipsis } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { iconSize } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/** The player's top: down to close, what it is, and its menu. */
export function PlayerHeader({ onClose, onMenu }: { onClose: () => void; onMenu?: () => void }) {
  const tokens = useThemeTokens();
  return (
    <ScreenHeader
      title=""
      center={
        <ThemedText type="labelSm" color={tokens['--color-muted-foreground']}>
          NOW PLAYING
        </ThemedText>
      }
      leftIcon={<ChevronDown size={iconSize.default} color={tokens['--color-foreground']} />}
      leftLabel="Close the player"
      onLeftPress={onClose}
      rightIcon={onMenu ? <Ellipsis size={iconSize.default} color={tokens['--color-foreground']} /> : undefined}
      rightLabel="More"
      onRightPress={onMenu}
    />
  );
}
