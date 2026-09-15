import React from "react";
import { View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { useCSSVariable } from "uniwind";

import {
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    Settings,
    TrendingDown,
    TrendingUp,
    type LucideIcon,
} from "@/components/icons";
import { PageFade } from "@/components/scroll-fades";
import { ThemedText } from "@/components/themed-text";
import { Badge } from "@/components/ui/badge";
import { GoldButton } from "@/components/ui/gold-button";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Touchable } from "@/components/ui/touchable";
import { PlanChangeView } from "@/features/billing/components/plan-change-view";
import { formatSubscriptionDate } from "@/features/billing/utils/subscription-lifecycle";
import { useBackHandler } from "@/hooks/use-back-handler";
import type { SubscriptionLifecycle } from "@/services/purchase-lifecycle";
import type { PlanModel, PurchaseOutcome } from "@/stores/subscription";
import { asColor } from "@/utils/colors";
import { haptics } from "@/utils/haptics";
import { CREDIT_PLANS, type CreditPlan, type PlanId } from "samwell-shared";

type SubscriptionBusy = PlanId | "restore" | "manage" | null;

function ManagementRow({
  icon: Icon,
  label,
  detail,
  busy,
  disabled,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  detail: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const mutedForeground = useCSSVariable("--color-muted-foreground");

  return (
    <Touchable
      className="flex-row items-center gap-3 border-t border-border py-3"
      onPress={onPress}
      disabled={disabled}
      haptic="select"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={detail}
      accessibilityState={{ disabled, busy }}
    >
      <View className="h-9 w-9 items-center justify-center bg-muted">
        <Icon size={17} color={asColor(mutedForeground)} />
      </View>
      <View className="flex-1 gap-0.5">
        <ThemedText type="bodyMd">{label}</ThemedText>
        <ThemedText type="bodySm" color={asColor(mutedForeground)}>
          {detail}
        </ThemedText>
      </View>
      {busy ? (
        <Spinner size="sm" label={`${label} in progress`} />
      ) : (
        <ChevronRight size={17} color={asColor(mutedForeground)} />
      )}
    </Touchable>
  );
}

export function SubscriptionManagementSheet({
  visible,
  plan,
  lifecycle,
  upgradePlans,
  downgradePlans,
  packages,
  catalogue,
  modelCounts,
  testStore,
  busy,
  loading,
  onClose,
  onChoose,
  onRestore,
  onManage,
}: {
  visible: boolean;
  plan: PlanId;
  lifecycle: SubscriptionLifecycle | null;
  upgradePlans: CreditPlan[];
  downgradePlans: CreditPlan[];
  packages: Partial<Record<PlanId, PurchasesPackage>>;
  catalogue: PlanModel[];
  modelCounts: Record<PlanId, number>;
  testStore: boolean;
  busy: SubscriptionBusy;
  loading: boolean;
  onClose: () => void;
  onChoose: (
    plan: PlanId,
    packageToBuy: PurchasesPackage,
  ) => Promise<PurchaseOutcome>;
  onRestore: () => void;
  onManage: () => void;
}) {
  const [mutedForeground, gold] = useCSSVariable([
    "--color-muted-foreground",
    "--color-primary",
  ]);
  const [view, setView] = React.useState<"manage" | "upgrade" | "downgrade">(
    "manage",
  );
  const [selectedPlanId, setSelectedPlanId] = React.useState<PlanId | null>(
    null,
  );
  const [changePlans, setChangePlans] = React.useState<CreditPlan[]>([]);
  const [purchasing, setPurchasing] = React.useState(false);
  const planDetails = CREDIT_PLANS[plan];
  const controlsDisabled = busy !== null;
  const changingPlan = view !== "manage";
  const planChangePlans = changingPlan ? changePlans : [];
  const selectedPlan =
    planChangePlans.find((candidate) => candidate.id === selectedPlanId) ??
    planChangePlans[0];
  const selectedPackage = selectedPlan ? packages[selectedPlan.id] : undefined;
  const currentLifecycle = lifecycle?.plan === plan ? lifecycle : null;
  const periodEnd = formatSubscriptionDate(currentLifecycle?.expiresAt ?? null);
  const hasBillingIssue = Boolean(currentLifecycle?.billingIssueDetectedAt);
  const canceled = Boolean(currentLifecycle?.unsubscribeDetectedAt);
  const nonRenewing = currentLifecycle !== null && !currentLifecycle.willRenew;
  const statusLabel = hasBillingIssue
    ? "Payment issue"
    : canceled
      ? "Canceled"
      : nonRenewing
        ? "Not renewing"
        : "Active";
  const statusVariant: "warning" | "secondary" = hasBillingIssue
    ? "warning"
    : "secondary";
  const statusDetail = hasBillingIssue
    ? periodEnd
      ? `Access remains active through ${periodEnd} while the store retries payment.`
      : "Access remains active while the store retries payment."
    : nonRenewing
      ? periodEnd
        ? `Access remains active through ${periodEnd}.`
        : "Access remains active through the end of this billing period."
      : `${planDetails.monthlyCredits.toLocaleString()} neurons each month`;
  const manageLabel = hasBillingIssue ? "Fix payment" : "Manage or cancel";
  const manageDetail = testStore
    ? "Open Test Store guidance"
    : hasBillingIssue
      ? "Update your payment method in the store"
      : "Continue in your device's subscription settings";

  const openPlanChange = (direction: "upgrade" | "downgrade") => {
    const plans = direction === "upgrade" ? upgradePlans : downgradePlans;
    setChangePlans(plans);
    setSelectedPlanId(plans[0]?.id ?? null);
    setPurchasing(false);
    setView(direction);
  };

  const close = React.useCallback(() => {
    setPurchasing(false);
    setView("manage");
    onClose();
  }, [onClose]);

  const chooseSelectedPlan = async () => {
    if (!selectedPlan || !selectedPackage) return;
    haptics.commit();
    setPurchasing(true);
    const outcome = await onChoose(selectedPlan.id, selectedPackage);
    // A change that did not happen leaves the sheet open and working, so it
    // can be tried again without finding the way back in.
    if (outcome) close();
    else setPurchasing(false);
  };

  const planChangeFooter =
    changingPlan && selectedPlan ? (
      <View className="bg-popover px-6 pt-3">
        <GoldButton
          label={view === "upgrade" ? "UPGRADE PLAN" : "DOWNGRADE PLAN"}
          accessibilityLabel={`${view === "upgrade" ? "Upgrade to" : "Downgrade to"} ${selectedPlan.label}`}
          size="full"
          loading={purchasing}
          disabled={!selectedPackage || busy !== null}
          onPress={() => void chooseSelectedPlan()}
        />
      </View>
    ) : undefined;

  useBackHandler(changingPlan, () => setView("manage"));

  return (
    <Sheet
      visible={visible}
      onClose={close}
      snapRatios={[0.72, 0.92]}
      scrollable
      contentPanning={false}
      footer={planChangeFooter}
      footerBehavior="attached"
    >
      {view === "manage" ? (
        <PageFade edges="both" surface="popover">
          <Sheet.ScrollView contentContainerClassName="gap-5 px-6 pb-2 pt-2">
            <>
              <View className="gap-1">
                <ThemedText type="headlineSm">Manage Subscription</ThemedText>
                <ThemedText type="bodySm" color={asColor(mutedForeground)}>
                  Change the plan or hand billing back to the store.
                </ThemedText>
              </View>

              <View className="gap-2 bg-muted p-4">
                <View className="flex-row items-center justify-between gap-3">
                  <ThemedText type="labelSm" color={asColor(mutedForeground)}>
                    CURRENT PLAN
                  </ThemedText>
                  <Badge variant={statusVariant}>{statusLabel}</Badge>
                </View>
                <ThemedText type="headlineSm">{planDetails.label}</ThemedText>
                <ThemedText type="bodySm" color={asColor(mutedForeground)}>
                  {statusDetail}
                </ThemedText>
              </View>

              {upgradePlans.length > 0 ? (
                <GoldButton
                  label="UPGRADE PLAN"
                  icon={TrendingUp}
                  size="compact"
                  disabled={controlsDisabled}
                  onPress={() => openPlanChange("upgrade")}
                />
              ) : (
                <ThemedText type="bodySm" color={asColor(mutedForeground)}>
                  You are on the highest plan.
                </ThemedText>
              )}

              <View>
                {downgradePlans.length > 0 ? (
                  <ManagementRow
                    icon={TrendingDown}
                    label="Downgrade plan"
                    detail="Choose a lower plan for your next renewal"
                    busy={false}
                    disabled={controlsDisabled}
                    onPress={() => openPlanChange("downgrade")}
                  />
                ) : null}
                <ManagementRow
                  icon={RefreshCw}
                  label="Restore purchases"
                  detail="Check this store account for an existing plan"
                  busy={busy === "restore"}
                  disabled={controlsDisabled}
                  onPress={onRestore}
                />
                <ManagementRow
                  icon={Settings}
                  label={manageLabel}
                  detail={manageDetail}
                  busy={busy === "manage"}
                  disabled={controlsDisabled}
                  onPress={onManage}
                />
              </View>

              {testStore ? (
                <ThemedText type="bodySm" color={asColor(mutedForeground)}>
                  RevenueCat Test Store has no App Store or Play cancellation
                  page. Monthly test plans renew every five minutes and cancel
                  automatically after the fifth renewal.
                </ThemedText>
              ) : null}
            </>
          </Sheet.ScrollView>
        </PageFade>
      ) : (
        <View className="flex-1">
          <View className="flex-none px-4 pb-1 pt-2">
            <Touchable
              onPress={() => setView("manage")}
              haptic="select"
              hitSlop={{ top: 4, bottom: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Back to manage subscription"
              style={{
                height: 44,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <ChevronLeft size={18} color={asColor(gold)} strokeWidth={2} />
              <ThemedText type="labelSm" color={asColor(gold)}>
                MANAGE SUBSCRIPTION
              </ThemedText>
            </Touchable>
          </View>
          <PlanChangeView
            direction={view}
            plans={planChangePlans}
            packages={packages}
            catalogue={catalogue}
            modelCounts={modelCounts}
            busy={busy}
            loading={loading}
            onSelectionChange={setSelectedPlanId}
            onChoose={onChoose}
          />
        </View>
      )}
    </Sheet>
  );
}
