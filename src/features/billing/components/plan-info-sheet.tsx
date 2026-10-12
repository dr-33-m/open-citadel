import React from 'react';
import { View } from 'react-native';

import { AudioLines, Brain, type LucideIcon } from '@/components/icons';
import { PageFade } from '@/components/scroll-fades';
import { ThemedText } from '@/components/themed-text';
import { PrefixIcon } from '@/components/ui/prefix-icon';
import { Sheet } from '@/components/ui/sheet';
import { PlanNeurons } from '@/features/billing/components/plan-neurons';
import { PlanSpendPanes } from '@/features/billing/components/plan-spend-panes';
import { PlanSpendTile } from '@/features/billing/components/plan-spend-tile';
import { usePlanInfo } from '@/features/billing/hooks/use-plan-info';
import type { PlanFactModel } from '@/features/billing/utils/plan-facts';
import { PLAN_ICON } from '@/features/billing/utils/plan-icon';
import type { PlanSpend } from '@/features/billing/utils/plan-spend';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { CreditPlan, VoiceFigures } from 'samwell-shared';

const TAGLINE = 'Cloud intelligence for your Citadel.';

const SPEND_ICON: Record<PlanSpend, LucideIcon> = { brains: Brain, voices: AudioLines };

export interface PlanInfoSheetProps {
  visible: boolean;
  onClose: () => void;
  plan: CreditPlan;
  models: readonly PlanFactModel[];
  /** The server's own count, for when the catalogue itself is not available. */
  modelCount: number;
  /** The cloud reading voices and their hours; null from an older server, which leaves the brains alone. */
  voices?: VoiceFigures | null;
  /** The side whoever raised the sheet was asking about. */
  opensOn?: PlanSpend;
}

/**
 * What a plan buys, as one figure and the two things it is spent on.
 *
 * The month's Neurons lead, because they are the one thing bought. Under
 * them sit two equal tiles, brains and voices, each saying how far the whole
 * month would go spent its way: that the two draw on one balance is the
 * thing a reader most needs to take away, so it is the layout itself and not
 * a sentence. The tiles are also the tabs. The chosen one shows, beneath, the
 * control that browses its estimate and the list of what the plan includes
 * (`PlanSpendPanes`), so only one inventory is ever on screen, and the two
 * trade places with the short step the reading voice's panes take.
 *
 * Everything the sheet says is a number the server derived or a sum the
 * plan's own constants make true (`plan-spend.ts`). Against an older server
 * it keeps every promise it still can: no voices leaves one tile, no
 * catalogue leaves the counts.
 */
export function PlanInfoSheet({ visible, onClose, plan, models, modelCount, voices = null, opensOn = 'brains' }: PlanInfoSheetProps) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];
  const info = usePlanInfo({ plan, models, modelCount, voices, opensOn });
  const shared = info.tiles.length > 1;

  return (
    // A fixed viewport gives the registered scroll view a real box to scroll
    // inside, and keeps the sheet still as the sides trade places.
    <Sheet visible={visible} onClose={onClose} stackBehavior="push" fixedHeightRatio={0.82} scrollable>
      <PageFade edges="both" surface="popover">
        <Sheet.ScrollView showsVerticalScrollIndicator={false}>
          <View className="gap-6 px-6 pb-6 pt-2">
            <View className="flex-row items-center gap-3">
              <PrefixIcon icon={PLAN_ICON[plan.id]} color={tokens['--color-primary']} />
              <View className="flex-1 gap-0.5">
                <ThemedText type="headlineSm">{plan.label}</ThemedText>
                <ThemedText type="bodySm" color={muted}>
                  {TAGLINE}
                </ThemedText>
              </View>
            </View>

            <PlanNeurons plan={plan} shared={shared} />

            <View className="gap-2">
              <ThemedText type="labelSm" color={muted}>
                HOW FAR A MONTH GOES
              </ThemedText>
              <View className="flex-row gap-3" accessibilityRole="tablist">
                {info.tiles.map((tile) => (
                  <PlanSpendTile
                    key={tile.key}
                    icon={SPEND_ICON[tile.key]}
                    label={tile.label}
                    figure={tile.figure}
                    active={tile.key === info.shown}
                    onSelect={() => info.choose(tile.key)}
                  />
                ))}
              </View>
            </View>

            <PlanSpendPanes shown={info.shown} panes={info.panes} />
          </View>
        </Sheet.ScrollView>
      </PageFade>
    </Sheet>
  );
}
