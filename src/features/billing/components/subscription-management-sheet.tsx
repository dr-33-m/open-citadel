import React from "react";
import { View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { useCSSVariable } from "uniwind";

import { ChevronLeft } from "@/components/icons";
import { ThemedText } from "@/components/themed-text";
import { GoldButton } from "@/components/ui/gold-button";
import { Sheet } from "@/components/ui/sheet";
import { Touchable } from "@/components/ui/touchable";
import { PlanChangeView } from "@/features/billing/components/plan-change-view";
import { PlanManageView } from "@/features/billing/components/plan-manage-view";
import type { InsiderStanding } from "@/features/billing/utils/insider";
import { planStanding } from "@/features/billing/utils/plan-standing";
import { useBackHandler } from "@/hooks/use-back-handler";
import type { SubscriptionLifecycle } from "@/services/purchase-lifecycle";
import type { PlanModel, PurchaseOutcome } from "@/stores/subscription";
import { asColor } from "@/utils/colors";
import { haptics } from "@/utils/haptics";
import type { CreditPlan, PlanId, VoiceFigures } from "samwell-shared";

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
  voices = null,
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
  /** The cloud reading voices and their hours on each plan. Absent from an older server. */
  voices?: VoiceFigures | null;
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
  const gold = asColor(useCSSVariable("--color-primary"));
  const [view, setView] = React.useState<"manage" | "upgrade" | "downgrade">(
    "manage",
  );
  const [selectedPlanId, setSelectedPlanId] = React.useState<PlanId | null>(
    null,
  );
  const [changePlans, setChangePlans] = React.useState<CreditPlan[]>([]);
  const [purchasing, setPurchasing] = React.useState(false);
  const changingPlan = view !== "manage";
  const planChangePlans = changingPlan ? changePlans : [];
  const selectedPlan =
    planChangePlans.find((candidate) => candidate.id === selectedPlanId) ??
    planChangePlans[0];
  const selectedPackage = selectedPlan ? packages[selectedPlan.id] : undefined;
  // Bought or given, and everything the sheet says about which: see
  // `planStanding`.
  const standing = planStanding({ plan, lifecycle, balance, testStore });
  const backLabel = standing.title.toUpperCase();
  const upgrading = view === "upgrade";
  const changeLabel = upgrading ? "UPGRADE PLAN" : "DOWNGRADE PLAN";
  const changeHint = `${upgrading ? "Upgrade to" : "Downgrade to"} ${selectedPlan?.label ?? ""}`;

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
          label={changeLabel}
          accessibilityLabel={changeHint}
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
        <PlanManageView
          plan={plan}
          standing={standing}
          canUpgrade={upgradePlans.length > 0}
          canDowngrade={downgradePlans.length > 0}
          busy={busy}
          testStore={testStore}
          onUpgrade={() => openPlanChange("upgrade")}
          onDowngrade={() => openPlanChange("downgrade")}
          onRestore={onRestore}
          onManage={onManage}
          onInsiderCode={onInsiderCode}
        />
      ) : (
        <View className="flex-1">
          <View className="flex-none px-4 pb-1 pt-2">
            <Touchable
              onPress={() => setView("manage")}
              haptic="select"
              hitSlop={{ top: 4, bottom: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Back to ${standing.title}`}
              style={{
                height: 44,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <ChevronLeft size={18} color={gold} strokeWidth={2} />
              <ThemedText type="labelSm" color={gold}>
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
            voices={voices}
            busy={busy}
            onSelectionChange={setSelectedPlanId}
            onChoose={onChoose}
          />
        </View>
      )}
    </Sheet>
  );
}
