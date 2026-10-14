import React from "react";
import { View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { useCSSVariable } from "uniwind";

import {
    ChevronLeft,
    RefreshCw,
    Settings,
    Ticket,
    TrendingDown,
    TrendingUp,
} from "@/components/icons";
import { PageFade } from "@/components/scroll-fades";
import { ThemedText } from "@/components/themed-text";
import { Badge } from "@/components/ui/badge";
import { PrefixIcon } from "@/components/ui/prefix-icon";
import { GoldButton } from "@/components/ui/gold-button";
import { Sheet } from "@/components/ui/sheet";
import { Touchable } from "@/components/ui/touchable";
import { ManagementRow } from "@/features/billing/components/management-row";
import { PlanChangeView } from "@/features/billing/components/plan-change-view";
import type { InsiderStanding } from "@/features/billing/utils/insider";
import { PLAN_ICON } from "@/features/billing/utils/plan-icon";
import { planStanding } from "@/features/billing/utils/plan-standing";
import { useBackHandler } from "@/hooks/use-back-handler";
import type { SubscriptionLifecycle } from "@/services/purchase-lifecycle";
import type { PlanModel, PurchaseOutcome } from "@/stores/subscription";
import { asColor } from "@/utils/colors";
import { haptics } from "@/utils/haptics";
import { CREDIT_PLANS, type CreditPlan, type PlanId } from "samwell-shared";

type SubscriptionBusy = PlanId | "restore" | "manage" | null;

export function SubscriptionManagementSheet({
  visible,
  plan,
  lifecycle,
  balance,
  upgradePlans,
  downgradePlans,
  packages,
  catalogue,
  modelCounts,
  testStore,
  busy,
  onClose,
  onChoose,
  onRestore,
  onManage,
  onInsiderCode,
}: {
  visible: boolean;
  plan: PlanId;
  lifecycle: SubscriptionLifecycle | null;
  /** Whether the plan was bought or given, and when a given one ends. */
  balance: InsiderStanding;
  upgradePlans: CreditPlan[];
  downgradePlans: CreditPlan[];
  packages: Partial<Record<PlanId, PurchasesPackage>>;
  catalogue: PlanModel[];
  modelCounts: Record<PlanId, number>;
  testStore: boolean;
  busy: SubscriptionBusy;
  onClose: () => void;
  onChoose: (
    plan: PlanId,
    packageToBuy: PurchasesPackage,
  ) => Promise<PurchaseOutcome>;
  onRestore: () => void;
  onManage: () => void;
  /** Redeem another insider code. Only offered on an insider plan. */
  onInsiderCode: () => void;
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
  // Bought or given, and everything the sheet says about which: see
  // `planStanding`.
  const standing = planStanding({ plan, lifecycle, balance, testStore });
  const title = standing.insider ? "Insider Plan" : "Manage Subscription";
  const subtitle = standing.insider
    ? "Given to you by Open Citadel. Nothing is charged."
    : "Change the plan or hand billing back to the store.";
  const backLabel = title.toUpperCase();

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
          size="compact"
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
                <ThemedText type="headlineSm">{title}</ThemedText>
                <ThemedText type="bodySm" color={asColor(mutedForeground)}>
                  {subtitle}
                </ThemedText>
              </View>

              <View className="gap-2 bg-muted p-4">
                <View className="flex-row items-center justify-between gap-3">
                  <ThemedText type="labelSm" color={asColor(mutedForeground)}>
                    CURRENT PLAN
                  </ThemedText>
                  <Badge variant={standing.tone}>{standing.badge}</Badge>
                </View>
                <View className="flex-row items-center gap-3">
                  <PrefixIcon icon={PLAN_ICON[plan]} size={36} />
                  <ThemedText type="headlineSm" className="shrink">
                    {planDetails.label}
                  </ThemedText>
                </View>
                <ThemedText type="bodySm" color={asColor(mutedForeground)}>
                  {standing.detail}
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

              {standing.insider ? (
                /* No store behind an insider plan, so none of the store's
                   rows: nothing to restore, downgrade or cancel. What can be
                   done is to put a newer code in its place. */
                <View className="gap-3">
                  {upgradePlans.length > 0 ? (
                    <ThemedText type="bodySm" color={asColor(mutedForeground)}>
                      A plan you buy takes the place of your insider plan.
                    </ThemedText>
                  ) : null}
                  <ManagementRow
                    icon={Ticket}
                    label="Use another code"
                    detail="A new code takes the place of this one"
                    busy={false}
                    disabled={controlsDisabled}
                    onPress={onInsiderCode}
                  />
                </View>
              ) : (
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
                    label={standing.manageLabel}
                    detail={standing.manageDetail}
                    busy={busy === "manage"}
                    disabled={controlsDisabled}
                    onPress={onManage}
                  />
                </View>
              )}

              {testStore && !standing.insider ? (
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
              accessibilityLabel={`Back to ${title}`}
              style={{
                height: 44,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <ChevronLeft size={18} color={asColor(gold)} strokeWidth={2} />
              <ThemedText type="labelSm" color={asColor(gold)}>
                {backLabel}
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
            onSelectionChange={setSelectedPlanId}
            onChoose={onChoose}
          />
        </View>
      )}
    </Sheet>
  );
}
