import React from 'react';
import { View, type TextStyle } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { PageFade } from '@/components/scroll-fades';
import { Sheet } from '@/components/ui/sheet';
import type { CreditPlan } from 'samwell-shared';
import { asColor } from '@/utils/colors';
import { planFacts, type PlanFactModel } from '@/features/billing/utils/plan-facts';

const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

const COUNT_AS_WORDS: Record<number, string> = {
  1: 'One',
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
  8: 'Eight',
  9: 'Nine',
};

/**
 * What the three lines on a plan card mean, in plain English.
 *
 * The card is terse on purpose - three ticks are the decision, not the
 * explanation - so the sheet answers each tick in the card's own order
 * (credits, models, rollover), under the card's own words for headers. A
 * reader who tapped the mark on the credits line finds AI CREDITS first, and
 * nothing in here asks a question the card failed to answer: the
 * conversations figure is a floor named on its dearest model, the model list
 * is the actual inventory, and the rollover is a worked sum whose numbers
 * stay under the carry-over cap so the addition is true without a footnote
 * in the middle of it.
 *
 * ## Against an older server
 *
 * The model list and the conversations figure both need the catalogue, which
 * `/billing/me` has shipped only recently. Without it the sheet keeps every
 * promise it can still keep - the counts from `modelCount`, the rollover sum
 * from the plan's own constants - and stays silent about what it cannot see,
 * rather than naming the wrong models or a wrong number.
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
  const [mutedForeground] = useCSSVariable(['--color-muted-foreground']);
  const muted = asColor(mutedForeground);
  const facts = React.useMemo(() => planFacts(plan, models), [plan, models]);
  const hasCatalogue = models.length > 0;

  const section = React.useCallback(
    (header: string, body: React.ReactNode) => (
      <View className="gap-2">
        <ThemedText type="labelSm" color={muted}>
          {header}
        </ThemedText>
        {body}
      </View>
    ),
    [muted],
  );

  /*
   * The count the MODELS section opens with. Named from the catalogue when
   * the server ships one, and from the server's own `modelsByPlan` count
   * when it does not - never from the empty list, which would read "Zero
   * models" against a plan the server itself counts in the sixes and nines.
   */
  const count = hasCatalogue ? facts.modelLabels.length : modelCount;
  const countWord = COUNT_AS_WORDS[count] ?? String(count);
  const capIsHalf = plan.rolloverCap === plan.monthlyCredits / 2;
  return (
    // `maxHeightRatio` is the cap and the only cap - the sheet measures the
    // content and stops there. Same contract as the model sheet beside it.
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.85} scrollable>
      <PageFade edges="both" surface="popover">
        <Sheet.ScrollView contentContainerClassName="pb-2">
          <View className="px-6 pb-6">
            <ThemedText type="headlineSm">{plan.label}</ThemedText>
          </View>

          <View className="gap-7 px-6 pb-8">
            {section(
              'AI CREDITS',
              <View className="gap-2">
                <ThemedText type="bodySm">
                  Every message spends a few credits, and the stronger the model, the more it
                  spends.
                </ThemedText>
                {facts.conversationsFloor != null && facts.dearestLabel ? (
                  <ThemedText type="bodySm">
                    {plan.monthlyCredits.toLocaleString()} credits is roughly{' '}
                    {facts.conversationsFloor.toLocaleString()} conversations, even on{' '}
                    {facts.dearestLabel}, the deepest model this plan reaches. Faster models go
                    much further.
                  </ThemedText>
                ) : null}
              </View>,
            )}

            {section(
              'MODELS',
              <View className="gap-2">
                <ThemedText type="bodySm">
                  {countWord} models are open to this plan
                  {hasCatalogue ? ':' : '.'}
                </ThemedText>
                {hasCatalogue ? (
                  <View className="gap-1.5">
                    {facts.modelLabels.map((label) => (
                      <ThemedText key={label} type="bodySm">
                        {label}
                      </ThemedText>
                    ))}
                  </View>
                ) : null}
              </View>,
            )}

            {section(
              'ROLLOVER',
              <View className="gap-2">
                <ThemedText type="bodySm">
                  Whatever you do not spend carries into next month. Spend{' '}
                  {(plan.monthlyCredits - facts.rolloverLeft).toLocaleString()} of{' '}
                  {plan.monthlyCredits.toLocaleString()} and next month starts at:
                </ThemedText>
                {/*
                 * The sum, on its own line, in the plan's real numbers. The
                 * figures are tabular so the columns read as arithmetic
                 * rather than as prose, and the operators sit back a shade -
                 * the numbers are the sentence.
                 */}
                <View className="self-start bg-muted px-3 py-2">
                  <View className="flex-row items-baseline gap-1.5">
                    <ThemedText type="bodyMd" style={TABULAR}>
                      {facts.rolloverLeft.toLocaleString()}
                    </ThemedText>
                    <ThemedText type="bodySm" color={muted}>
                      +
                    </ThemedText>
                    <ThemedText type="bodyMd" style={TABULAR}>
                      {plan.monthlyCredits.toLocaleString()}
                    </ThemedText>
                    <ThemedText type="bodySm" color={muted}>
                      =
                    </ThemedText>
                    <ThemedText type="bodyMd" style={TABULAR}>
                      {facts.rolloverSum.toLocaleString()}
                    </ThemedText>
                    <ThemedText type="bodySm" color={muted}>
                      credits
                    </ThemedText>
                  </View>
                </View>
                <ThemedText type="bodySm" color={muted}>
                  Carry-over tops out at {plan.rolloverCap.toLocaleString()} credits
                  {capIsHalf ? ', half a month’s grant' : ''}.
                </ThemedText>
              </View>,
            )}
          </View>
        </Sheet.ScrollView>
      </PageFade>
    </Sheet>
  );
}
