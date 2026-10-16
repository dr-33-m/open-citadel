import React from 'react';

import { ListChecks } from '@/components/icons';
import { Text } from '@/components/ui/text';
import { Touchable } from '@/components/ui/touchable';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { asColor } from '@/utils/colors';
import type { TurnStep } from '@/utils/turn-activity';

interface TasksButtonProps {
  steps: readonly TurnStep[];
  /** Raises the sheet listing what he did. */
  onOpen: (steps: readonly TurnStep[]) => void;
}

/**
 * What Samwell did on the way to a reply, folded to a ticked list and a
 * count, in the reply's footer beside the thought and the sources. A tap
 * raises the steps in a sheet (`TasksSheet`). While the turn runs, the step
 * he is on is drawn above the reply instead (`TurnTrail live`).
 */
export const TasksButton = React.memo(function TasksButton({ steps, onOpen }: TasksButtonProps) {
  const muted = asColor(useThemeTokens()['--color-muted-foreground']);
  const open = React.useCallback(() => onOpen(steps), [onOpen, steps]);
  const label = `${steps.length === 1 ? 'One step' : `${steps.length} steps`}. Show what Samwell did.`;
  return (
    <Touchable onPress={open} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} className="flex-row items-center gap-1.5 py-1">
      <ListChecks size={16} color={muted} />
      <Text className="text-sm text-muted-foreground">{steps.length}</Text>
    </Touchable>
  );
});
