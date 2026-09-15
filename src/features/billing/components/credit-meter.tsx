import { View, type TextStyle } from "react-native";
import { useCSSVariable } from "uniwind";

import { ThemedText } from "@/components/themed-text";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Touchable } from "@/components/ui/touchable";
import { formatSubscriptionDate } from "@/features/billing/utils/subscription-lifecycle";
import type { SubscriptionLifecycle } from "@/services/purchase-lifecycle";
import { asColor } from "@/utils/colors";
import { type CreditBalance } from "samwell-shared";

const TABULAR_SMALL: TextStyle = {
  fontSize: 11,
  fontVariant: ["tabular-nums"],
};
const SMALL: TextStyle = { fontSize: 11 };

/** Below this share of the grant, the number starts saying so. */
const LOW_SHARE = 0.1;

/**
 * What is left, against this plan's monthly grant.
 *
 * Replaces the two rolling message bars this panel used to draw. Those
 * counted messages, which was the wrong unit twice over: it made a flash
 * model and Opus cost the same, and it could not be sold. Credits are one
 * number, and it is the number the server refuses turns on.
 */
export function CreditMeter({
  balance,
  lifecycle,
  loading,
  error,
  onRefresh,
}: {
  balance: CreditBalance;
  lifecycle: SubscriptionLifecycle | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const [mutedForeground, primary, warning] = useCSSVariable([
    "--color-muted-foreground",
    "--color-primary",
    "--color-warning-foreground",
  ]);
  const muted = asColor(mutedForeground);

  const grant = Math.max(0, balance.grant);
  const available = Math.max(0, balance.available);
  const rollover = Math.max(0, available - grant);
  const low = grant > 0 && available <= grant * LOW_SHARE;
  const lifecycleMatchesPlan =
    lifecycle?.plan === balance.plan ? lifecycle : null;
  const periodEndsAt = lifecycleMatchesPlan?.expiresAt ?? balance.periodEndsAt;
  const periodEnd = formatSubscriptionDate(periodEndsAt);
  const periodDetail = periodEnd
    ? lifecycleMatchesPlan?.billingIssueDetectedAt
      ? `payment issue · access through ${periodEnd}`
      : lifecycleMatchesPlan?.willRenew === true
        ? `renews ${periodEnd}`
        : lifecycleMatchesPlan?.willRenew === false
          ? `ends ${periodEnd}`
          : `period ends ${periodEnd}`
    : null;
  const details = [
    grant > 0 ? `${grant.toLocaleString()} added monthly` : null,
    rollover > 0 ? `${rollover.toLocaleString()} rollover included` : null,
    periodDetail,
  ]
    .filter((detail): detail is string => detail !== null)
    .join(" · ");

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <ThemedText type="labelSm" color={muted}>
          NEURONS
        </ThemedText>
        {/* The ring stands where the word was rather than beside it, so the
            row does not change width mid-request and shove the label across. */}
        {loading ? (
          <Spinner size="sm" label="Checking your neurons" />
        ) : (
          <Touchable
            onPress={onRefresh}
            accessibilityRole="button"
            accessibilityLabel="Refresh available neurons"
          >
            <ThemedText type="labelSm" color={asColor(primary)}>
              REFRESH
            </ThemedText>
          </Touchable>
        )}
      </View>

      <Progress value={available} minValue={0} maxValue={grant} size="sm" />

      <ThemedText
        type="bodySm"
        color={low ? asColor(warning) : muted}
        style={TABULAR_SMALL}
      >
        {available.toLocaleString()} available
      </ThemedText>

      {details ? (
        <ThemedText type="bodySm" color={muted} style={TABULAR_SMALL}>
          {details}
        </ThemedText>
      ) : null}

      {error ? (
        <ThemedText type="bodySm" color={muted} style={SMALL}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}
