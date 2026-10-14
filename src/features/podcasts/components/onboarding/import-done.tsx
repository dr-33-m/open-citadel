import React from 'react';
import Animated from 'react-native-reanimated';

import { CircleCheckBig } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { revealIn } from '@/constants/theme';
import { OnboardingStage } from '@/components/stage/onboarding-stage';
import { StageGlyph } from '@/components/stage/stage-glyph';
import { StageHeading } from '@/components/stage/stage-heading';
import { StatGrid } from '@/components/stage/stat-grid';
import { importOutcome, importStats, type ImportResult } from '@/features/podcasts/utils/import-summary';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type ImportDoneProps = {
  result: ImportResult;
  bottomPadding: number;
  onDone: () => void;
};

/** An import finished: what came across, counted, and the one way on. */
export function ImportDone({ result, bottomPadding, onDone }: ImportDoneProps) {
  const tokens = useThemeTokens();
  const stats = importStats(result);
  const outcome = importOutcome(result);

  return (
    <OnboardingStage bottomPadding={bottomPadding} footer={<GoldButton label="OPEN MY PODCASTS" onPress={onDone} />}>
      <StageGlyph icon={CircleCheckBig} color={tokens['--color-primary']} />
      <StageHeading title={outcome.title} subtitle="Here is what came across." />
      <StatGrid stats={stats} firstStep={2} />
      <Animated.View entering={revealIn(2 + stats.length)}>
        <ThemedText type="bodySm" color={tokens['--color-muted-foreground']} className="text-center">
          {outcome.note}
        </ThemedText>
      </Animated.View>
    </OnboardingStage>
  );
}
