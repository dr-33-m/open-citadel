import React from 'react';

import { Brain } from '@/components/icons';
import { Text } from '@/components/ui/text';
import { thoughtForLabel } from '@/components/ui/reasoning';
import { Touchable } from '@/components/ui/touchable';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { asColor } from '@/utils/colors';
import { thoughtDuration } from '@/utils/thought-duration';
import type { TurnThought } from '@/utils/turn-activity';

interface ThoughtButtonProps {
  thought: TurnThought;
  /** Raises the sheet with what he thought. */
  onOpen: (thought: TurnThought) => void;
}

/**
 * What he worked through before a reply, folded to a brain and how long it
 * took ("12s"), in the reply's footer beside the copy button and the sources.
 * A tap raises the whole trace in a sheet (`ThoughtSheet`), as the sources
 * do. A brain because the models are his brains everywhere else in the app.
 */
export const ThoughtButton = React.memo(function ThoughtButton({ thought, onOpen }: ThoughtButtonProps) {
  const muted = asColor(useThemeTokens()['--color-muted-foreground']);
  const open = React.useCallback(() => onOpen(thought), [onOpen, thought]);
  const label = `${thoughtForLabel(thought.seconds ?? undefined)}. Show what he thought.`;
  return (
    <Touchable onPress={open} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} className="flex-row items-center gap-1.5 py-1">
      <Brain size={16} color={muted} />
      {thought.seconds !== null ? <Text className="text-sm text-muted-foreground">{thoughtDuration(thought.seconds)}</Text> : null}
    </Touchable>
  );
});
