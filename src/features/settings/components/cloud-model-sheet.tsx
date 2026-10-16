import React from 'react';
import { View } from 'react-native';
import type { PlanId } from 'samwell-shared';

import { PageFade } from '@/components/scroll-fades';
import { SwitchPanes } from '@/components/switch-panes';
import { TextSwitch } from '@/components/text-switch';
import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';
import { spacing } from '@/constants/theme';
import { BrainRow } from '@/features/settings/components/brain-row';
import { brainTiers, openingTier } from '@/features/settings/utils/brain-tiers';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { PlanModel } from '@/stores/subscription';
import { planShortName } from '@/utils/plan-name';

export interface CloudModelSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  activeId: string | null;
  models: PlanModel[];
  /** The reader's plan, which decides which tiers are listed and which leads. */
  plan: PlanId | null;
}

/** About how many rows sit in the sheet unscrolled on a small phone. */
const FITS_UNSCROLLED = 5;
const HEIGHT = 0.78;
const CONTENT = { paddingHorizontal: spacing[6], paddingBottom: spacing[4] };

/**
 * The cloud brains a plan reaches, to choose the one Samwell thinks with.
 *
 * A tier to a tab. Access is cumulative, so an Archmaester can reach the
 * Grand Maester and Maester brains too, and some months those are the right
 * call; but nine rows in one list bury the three being paid for. Folding the
 * lower tiers under chevrons hid them behind a control that did not say what
 * was inside, and an opened one pushed the list about. A switch says every
 * tier at once, keeps the sheet one height, and opens on the tier holding the
 * chosen brain, so the tick is always in view. A plan with one tier has no
 * switch at all.
 *
 * The title, its line and the switch are pinned; only the rows move.
 */
export function CloudModelSheet({ visible, onClose, onSelect, activeId, models, plan }: CloudModelSheetProps) {
  const muted = useThemeTokens()['--color-muted-foreground'];
  const tiers = React.useMemo(() => brainTiers(models, plan), [models, plan]);
  const [picked, setPicked] = React.useState<PlanId | null>(null);
  // Every opening starts on the chosen brain's tier, not where browsing left off.
  const [wasVisible, setWasVisible] = React.useState(visible);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (visible) setPicked(null);
  }
  const tier = tiers.some((candidate) => candidate.plan === picked) ? picked : openingTier(tiers, activeId);

  const tabs = React.useMemo(() => tiers.map((candidate) => ({ value: candidate.plan, label: planShortName(candidate.plan) })), [tiers]);
  const panes = {} as Record<PlanId, React.ReactNode>;
  for (const candidate of tiers) {
    panes[candidate.plan] = candidate.models.map((model, index) => (
      <View key={model.id} className={index === 0 ? undefined : 'border-t border-border/70'}>
        <BrainRow model={model} active={model.id === activeId} onSelect={onSelect} />
      </View>
    ));
  }
  // A sheet sized to its content never hands a list inside it the drag, so a
  // tier that can outgrow it gets a fixed box to scroll in (see `SourcesSheet`).
  // Judged on the longest tier, so switching never changes what kind of sheet it is.
  const long = tiers.some((candidate) => candidate.models.length > FITS_UNSCROLLED);
  const body = tier ? <SwitchPanes order={tabs.map((tab) => tab.value)} value={tier} panes={panes} /> : null;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      fixedHeightRatio={long ? HEIGHT : undefined}
      maxHeightRatio={long ? undefined : HEIGHT}
      scrollable={long}
    >
      <View className="gap-4 px-6 pb-2">
        <View className="gap-1">
          <ThemedText type="headlineSm">Choose Brain</ThemedText>
          <ThemedText type="bodySm" color={muted}>
            Stronger brains use more Neurons a message.
          </ThemedText>
        </View>
        {tabs.length > 1 && tier ? <TextSwitch options={tabs} value={tier} onChange={setPicked} /> : null}
      </View>
      {long ? (
        <PageFade edges="both" surface="popover">
          <Sheet.ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={CONTENT}>
            {body}
          </Sheet.ScrollView>
        </PageFade>
      ) : (
        <View style={CONTENT}>{body}</View>
      )}
    </Sheet>
  );
}
