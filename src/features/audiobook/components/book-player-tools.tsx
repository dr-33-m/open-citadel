import React from 'react';

import { AudioLines, Highlighter, ScrollText } from '@/components/icons';
import { iconSize } from '@/constants/theme';
import { PlayerTool } from '@/features/podcasts/components/player-tool';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type BookPlayerToolsProps = {
  /** The sentence being heard has been highlighted from the player. */
  highlighted: boolean;
  onText: () => void;
  onHighlight: () => void;
  onVoice: () => void;
};

/**
 * A book's own tools in the player's row, after speed and sleep: the text,
 * read along as it is heard; Highlight, the sentence being heard kept as a
 * highlight; and the voice. Muted like the rest of the row; Highlight fills
 * gold while the sentence being heard is highlighted, since gold says "on".
 */
export function BookPlayerTools({ highlighted, onText, onHighlight, onVoice }: BookPlayerToolsProps) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];
  const gold = tokens['--color-primary'];
  const highlightColor = highlighted ? gold : muted;
  return (
    <>
      <PlayerTool label="Text" onPress={onText}>
        <ScrollText size={iconSize.default} color={muted} />
      </PlayerTool>
      <PlayerTool label={highlighted ? 'Highlighted' : 'Highlight this sentence'} onPress={onHighlight}>
        <Highlighter size={iconSize.default} color={highlightColor} fill={highlighted ? `${gold}33` : 'none'} />
      </PlayerTool>
      <PlayerTool label="Voice" onPress={onVoice}>
        <AudioLines size={iconSize.default} color={muted} />
      </PlayerTool>
    </>
  );
}
