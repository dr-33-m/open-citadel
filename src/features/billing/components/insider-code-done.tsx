import React from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { TicketCheck } from '@/components/icons';
import { StageGlyph } from '@/components/stage/stage-glyph';
import { StageHeading } from '@/components/stage/stage-heading';
import { StatGrid } from '@/components/stage/stat-grid';
import { GoldButton } from '@/components/ui/gold-button';
import { revealIn } from '@/constants/theme';
import type { InsiderWelcome } from '@/features/billing/utils/insider';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

export type InsiderCodeDoneProps = {
  /** The plan, in a line and in figures. See `insiderWelcome`. */
  welcome: InsiderWelcome;
  onDone: () => void;
};

/**
 * A code that worked: what it turned out to be, as a line and two figures,
 * and the one way on.
 *
 * The staged layout in a sheet's width. The mark arrives first and the rest
 * follows it down, so the sheet reads as the answer landing rather than the
 * form being swapped for a receipt.
 */
export function InsiderCodeDone({ welcome, onDone }: InsiderCodeDoneProps) {
  const gold = useThemeTokens()['--color-primary'];

  return (
    <View className="items-center gap-6 px-6 pb-2 pt-2">
      <StageGlyph icon={TicketCheck} color={gold} />
      <StageHeading title="Welcome, insider" subtitle={welcome.line} />
      <StatGrid stats={welcome.figures} firstStep={2} />
      <Animated.View entering={revealIn(4)} className="self-stretch">
        <GoldButton label="DONE" size="compact" onPress={onDone} />
      </Animated.View>
    </View>
  );
}
