import React from 'react';
import { View, type TextStyle } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { RotateCw, type LucideIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { PageFade } from '@/components/scroll-fades';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { CREDIT_PLANS, PLAN_ORDER, type CreditPlan } from 'samwell-shared';
import { asColor } from '@/utils/colors';
import { planFacts, type PlanFactModel } from '@/features/billing/utils/plan-facts';

const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

const TAGLINE = 'Cloud intelligence for your Citadel.';

/**
 * What a plan buys, dressed the way the numbers deserve.
 *
 * The sheet is a page of figures, not a paragraph of prose: the grant in
 * display type, the conversations a reader can expect in one bordered
 * callout, the models as an inventory, the rollover as a ceiling. Sections
 * follow the card's three ticks in the card's own order, and everything the
 * sheet says is a number the server derived or a sum the plan's own
 * constants make true.
 *
 * ## Browsing the estimate
 *
 * The conversations callout is a decision screen, not a footnote: its model
 * line is a Select over every model the plan reaches, grouped by tier, and
 * picking one recomputes the figure. It opens on the dearest model in the
 * plan, so the number the reader sees first is the floor - browsing can only
 * make it bigger, never smaller.
 *
 * ## Against an older server
 *
 * The model list, the browse control and the conversations figure all need
 * the catalogue, which `/billing/me` has shipped only recently. Without it
 * the sheet keeps every promise it can still keep - the counts from
 * `modelCount`, the rollover from the plan's own constants - and stays
 * silent about what it cannot see, rather than naming the wrong models or a
 * wrong number.
 */
export function PlanInfoSheet({
  visible,
  onClose,
  plan,
  models,
  modelCount,
}: {
  visible: boolean;
  onClose: () => void;
  plan: CreditPlan;
  models: readonly PlanFactModel[];
  /** The server's own count, for when the catalogue itself is not available. */
  modelCount: number;
}) {
  const [primary, mutedForeground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
  ]);
  const muted = asColor(mutedForeground);
  const gold = asColor(primary);
  const facts = React.useMemo(() => planFacts(plan, models), [plan, models]);
  const hasCatalogue = models.length > 0;

  const [browsedId, setBrowsedId] = React.useState<string | null>(null);
  // Whose estimate the callout shows. The fallback is the plan's floor, and
  // a browsed id from a previous plan is never in the new plan's estimates,
  // so it falls back on its own - no reset, no effect.
  const selectedModelId =
    browsedId && facts.estimates[browsedId] !== undefined ? browsedId : facts.defaultModelId;
  const selectedModel = facts.models.find((model) => model.id === selectedModelId) ?? null;
  const conversations = selectedModelId ? facts.estimates[selectedModelId] : null;

  /*
   * The inventory compresses the way the tiers stack: a plan's sheet names
   * the models that are NEW at its own tier, and folds everything beneath it
   * into one line - "Plus the Maester and Grand Maester models" - because
   * access is cumulative and re-listing the lower tiers on every sheet is
   * the sheet arguing with the plan table.
   */
  const tierIndex = PLAN_ORDER.indexOf(plan.id);
  const ownBand = facts.models.filter((model) => model.minPlan === plan.id);
  const plusCount = facts.models.length - ownBand.length;
  const plusTiers = PLAN_ORDER.slice(0, tierIndex).map(
    (tier) => CREDIT_PLANS[tier].label.replace(/ Samwell$/, ''),
  );

  const stripProvider = (model: PlanFactModel) =>
    model.label.startsWith(`${model.provider}: `)
      ? model.label.slice(model.provider.length + 2).trim()
      : model.label;

  return (
    // `maxHeightRatio` is the cap and the only cap - the sheet measures the
    // content and stops there. Same contract as the model sheet beside it.
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.85} scrollable>
      <PageFade edges="both" surface="popover">
        <Sheet.ScrollView contentContainerClassName="pb-2">
          <View className="gap-1 px-6 pb-5">
            <ThemedText type="displayMd">{plan.label}</ThemedText>
            <ThemedText type="bodySm" color={muted}>
              {TAGLINE}
            </ThemedText>
          </View>

          <View className="h-px bg-surface-tertiary" />

          <View className="gap-7 px-6 py-6">
            {/* The grant, in the plan's own figures. */}
            <View className="gap-0.5">
              <ThemedText type="labelSm" color={muted}>AI CREDITS</ThemedText>
              <ThemedText type="displayLg" style={TABULAR}>
                {plan.monthlyCredits.toLocaleString()}
              </ThemedText>
              <ThemedText type="bodySm" color={muted}>credits / month</ThemedText>
              <ThemedText type="bodySm" color={muted}>
                Stronger models use more credits.
              </ThemedText>
            </View>

            {/*
             * The decision screen. The figure moves with the model chosen
             * below it; the gold bar marks it as the thing this sheet exists
             * to say.
             */}
            {hasCatalogue && conversations != null && selectedModel ? (
              <View className="gap-1 border border-primary/25 border-l-2 border-l-primary py-3 pl-3 pr-2">
                <View className="flex-row items-baseline gap-2">
                  <ThemedText type="displayMd" style={TABULAR}>
                    ≈ {conversations.toLocaleString()}
                  </ThemedText>
                  <ThemedText type="bodyMd">conversations</ThemedText>
                </View>
                {/*
                 * The browse control, dressed down to the mockup's quiet
                 * line: no field chrome, just "with" and the model's name,
                 * because the box it sits in is already the affordance.
                 */}
                <Select
                  value={selectedModel.id}
                  valueLabel={`with ${stripProvider(selectedModel)}`}
                  onValueChange={setBrowsedId}
                  title="Conversations by model"
                  presentation="overlay"
                  placeholder="Pick a model"
                  triggerClassName="border-0 bg-transparent px-0"
                  valueClassName="text-muted-foreground"
                  className="-ml-1 self-start"
                >
                  {ownBand.map((model) => (
                    <Select.Item key={model.id} value={model.id} label={stripProvider(model)} />
                  ))}
                  {plusTiers.map((tierName, i) => {
                    const tier = PLAN_ORDER[i];
                    const band = facts.models.filter((model) => model.minPlan === tier);
                    if (band.length === 0) return null;
                    return (
                      <Select.Group key={tier} label={tierName}>
                        {band.map((model) => (
                          <Select.Item key={model.id} value={model.id} label={stripProvider(model)} />
                        ))}
                      </Select.Group>
                    );
                  })}
                </Select>
              </View>
            ) : null}

            {/*
             * The inventory, compressed the way the tiers stack: the models
             * that are new at this tier, named, and everything beneath it in
             * one line - access is cumulative, and re-listing the lower
             * tiers here would be the sheet arguing with the plan table.
             */}
            <View className="gap-1">
              <ThemedText type="labelSm" color={muted}>MODELS</ThemedText>
              {hasCatalogue ? (
                <>
                  {ownBand.map((model) => (
                    <View
                      key={model.id}
                      className="flex-row items-baseline gap-2 border-b border-surface-tertiary py-2.5"
                    >
                      <ThemedText type="bodySm" color={muted} numberOfLines={1}>
                        {model.provider}
                      </ThemedText>
                      <ThemedText type="bodySm" color={muted}>—</ThemedText>
                      <ThemedText type="bodyMd" className="flex-1" numberOfLines={1}>
                        {stripProvider(model)}
                      </ThemedText>
                    </View>
                  ))}
                  {plusCount > 0 ? (
                    <ThemedText type="bodySm" color={muted} className="pt-1">
                      Plus the {plusCount}{' '}
                      {plusTiers.join(' and ')} models
                    </ThemedText>
                  ) : null}
                </>
              ) : (
                <ThemedText type="bodySm">
                  {modelCount.toLocaleString()} models are open to this plan.
                </ThemedText>
              )}
            </View>

            {/*
             * The ceiling, as a figure: what a light month can carry
             * forward. "Half a monthly grant" only states when it is true.
             */}
            <View className="flex-row items-start gap-3">
              <RolloverGlyph icon={RotateCw} color={gold} />
              <View className="gap-0.5">
                <ThemedText type="bodySm">Unused credits roll over</ThemedText>
                <ThemedText type="headlineLg" style={TABULAR}>
                  Up to +{plan.rolloverCap.toLocaleString()}
                </ThemedText>
                <ThemedText type="bodySm" color={muted}>
                  {plan.rolloverCap === plan.monthlyCredits / 2
                    ? 'half a monthly grant'
                    : `${plan.rolloverCap.toLocaleString()} credits`}
                </ThemedText>
              </View>
            </View>
          </View>
        </Sheet.ScrollView>
      </PageFade>
    </Sheet>
  );
}

/**
 * The rollover glyph, optically centred on the two-line block it leads -
 * the same trick the tick rows use, at icon size.
 */
function RolloverGlyph({ icon: Icon, color }: { icon: LucideIcon; color?: string }) {
  const [mutedForeground] = useCSSVariable(['--color-muted-foreground']);
  return (
    <View className="mt-3 items-center justify-center">
      <Icon size={22} color={color ?? (typeof mutedForeground === 'string' ? mutedForeground : undefined)} strokeWidth={1.75} />
    </View>
  );
}
