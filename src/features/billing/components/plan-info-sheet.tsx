import React from "react";
import { View, type TextStyle } from "react-native";
import { useCSSVariable } from "uniwind";

import { PageFade } from "@/components/scroll-fades";
import { ThemedText } from "@/components/themed-text";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import {
    planFacts,
    type PlanFactModel,
} from "@/features/billing/utils/plan-facts";
import { asColor } from "@/utils/colors";
import { CREDIT_PLANS, PLAN_ORDER, type CreditPlan } from "samwell-shared";

const TABULAR: TextStyle = { fontVariant: ["tabular-nums"] };

const TAGLINE = "Cloud intelligence for your Citadel.";

/**
 * What a plan buys, dressed the way the numbers deserve.
 *
 * The sheet is a compact page of figures, not a second sales card. The grant
 * and estimate carry the hierarchy; rollover is a supporting limit with its
 * own full-width row, and model access reads as a quiet inventory. Everything
 * the sheet says is a number the server derived or a sum the plan's own
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
  const [mutedForeground] = useCSSVariable(["--color-muted-foreground"]);
  const muted = asColor(mutedForeground);
  const facts = React.useMemo(() => planFacts(plan, models), [plan, models]);
  const hasCatalogue = models.length > 0;

  const [browsedId, setBrowsedId] = React.useState<string | null>(null);
  // Whose estimate the callout shows. The fallback is the plan's floor, and
  // a browsed id from a previous plan is never in the new plan's estimates,
  // so it falls back on its own - no reset, no effect.
  const selectedModelId =
    browsedId && facts.estimates[browsedId] !== undefined
      ? browsedId
      : facts.defaultModelId;
  const selectedModel =
    facts.models.find((model) => model.id === selectedModelId) ?? null;
  const conversations = selectedModelId
    ? facts.estimates[selectedModelId]
    : null;

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
  const inheritedTiers = PLAN_ORDER.slice(0, tierIndex).reverse();
  const plusTiers = inheritedTiers.map((tier) =>
    CREDIT_PLANS[tier].label.replace(/ Samwell$/, ""),
  );

  const stripProvider = (model: PlanFactModel) =>
    model.label.startsWith(`${model.provider}: `)
      ? model.label.slice(model.provider.length + 2).trim()
      : model.label;

  return (
    // A fixed viewport gives the registered scroll view a real box to scroll
    // inside. The model inventory can grow without changing the sheet's
    // geometry or leaving its last rows unreachable.
    <Sheet
      visible={visible}
      onClose={onClose}
      stackBehavior="push"
      fixedHeightRatio={0.82}
      scrollable
    >
      <PageFade edges="both" surface="popover">
        <Sheet.ScrollView showsVerticalScrollIndicator={false}>
          <View className="gap-1 px-6 pb-5">
            <ThemedText type="headlineMd">{plan.label}</ThemedText>
            <ThemedText type="bodySm" color={muted}>
              {TAGLINE}
            </ThemedText>
          </View>

          <View className="gap-6 px-6 pb-6">
            <View className="gap-1 border-y border-surface-tertiary py-4">
              <ThemedText type="labelSm" color={muted}>
                MONTHLY NEURONS
              </ThemedText>
              <View className="flex-row items-baseline gap-2">
                <ThemedText type="headlineLg" style={TABULAR}>
                  {plan.monthlyCredits.toLocaleString()}
                </ThemedText>
                <ThemedText type="bodySm" color={muted}>
                  neurons
                </ThemedText>
              </View>
              <ThemedText type="bodySm" color={muted}>
                Stronger brains use more neurons.
              </ThemedText>
            </View>

            {hasCatalogue && conversations != null && selectedModel ? (
              <View className="gap-3">
                <ThemedText type="labelSm" color={muted}>
                  ESTIMATED USE
                </ThemedText>
                <View className="flex-row items-baseline gap-2">
                  <ThemedText type="headlineLg" style={TABULAR}>
                    ≈ {conversations.toLocaleString()}
                  </ThemedText>
                  <ThemedText type="bodySm" color={muted}>
                    conversations / month
                  </ThemedText>
                </View>
                <ThemedText type="bodySm" color={muted}>
                  Estimate varies by brain
                </ThemedText>
                <Select
                  value={selectedModel.id}
                  valueLabel={stripProvider(selectedModel)}
                  onValueChange={setBrowsedId}
                  title="Conversations by brain"
                  presentation="overlay"
                  placeholder="Pick a brain"
                  contentWidth="trigger"
                  triggerClassName="min-h-0 border-border bg-background px-3 py-2"
                  valueClassName="text-sm font-normal"
                  listClassName="p-1"
                  className="w-full max-w-70"
                >
                  {ownBand.map((model) => (
                    <Select.Item
                      key={model.id}
                      value={model.id}
                      label={stripProvider(model)}
                      className="px-3 py-2.5"
                      labelClassName="text-sm font-normal"
                    />
                  ))}
                  {inheritedTiers.map((tier) => {
                    const tierName = CREDIT_PLANS[tier].label.replace(
                      / Samwell$/,
                      "",
                    );
                    const band = facts.models.filter(
                      (model) => model.minPlan === tier,
                    );
                    if (band.length === 0) return null;
                    return (
                      <Select.Group key={tier} label={tierName}>
                        {band.map((model) => (
                          <Select.Item
                            key={model.id}
                            value={model.id}
                            label={stripProvider(model)}
                            className="px-3 py-2.5"
                            labelClassName="text-sm font-normal"
                          />
                        ))}
                      </Select.Group>
                    );
                  })}
                </Select>
              </View>
            ) : null}

            {/* Rollover is useful context, not a second hero. Giving it the
                full width preserves the number at large text sizes and keeps
                its explanation attached to the value it qualifies. */}
            <View className="gap-1 border-y border-surface-tertiary py-4">
              <ThemedText type="labelSm" color={muted}>
                ROLLOVER LIMIT
              </ThemedText>
              <View className="flex-row items-baseline gap-2">
                <ThemedText type="headlineMd" style={TABULAR}>
                  +{plan.rolloverCap.toLocaleString()}
                </ThemedText>
                <ThemedText type="bodySm" color={muted}>
                  neurons
                </ThemedText>
              </View>
              <ThemedText type="bodySm" color={muted}>
                Unused neurons carry forward, up to this limit.
              </ThemedText>
            </View>

            <View className="gap-2">
              <View className="flex-row items-baseline justify-between gap-3">
                <ThemedText type="headlineSm">Included brains</ThemedText>
                <ThemedText type="bodySm" color={muted} style={TABULAR}>
                  {modelCount.toLocaleString()} total
                </ThemedText>
              </View>
              {hasCatalogue ? (
                <>
                  {ownBand.map((model) => (
                    <View
                      key={model.id}
                      className="flex-row items-baseline gap-2 border-b border-surface-tertiary py-3"
                    >
                      <ThemedText
                        type="labelSm"
                        color={muted}
                        numberOfLines={1}
                      >
                        {model.provider}
                      </ThemedText>
                      <ThemedText
                        type="bodyMd"
                        className="flex-1"
                        numberOfLines={1}
                      >
                        {stripProvider(model)}
                      </ThemedText>
                    </View>
                  ))}
                  {plusCount > 0 ? (
                    <ThemedText type="bodySm" color={muted} className="pt-1">
                      Plus the {plusCount} {plusTiers.join(" and ")} brains
                    </ThemedText>
                  ) : null}
                </>
              ) : (
                <ThemedText type="bodySm">
                  {modelCount.toLocaleString()} brains are open to this plan.
                </ThemedText>
              )}
            </View>
          </View>
        </Sheet.ScrollView>
      </PageFade>
    </Sheet>
  );
}
