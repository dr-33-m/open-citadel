import { View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { useCSSVariable } from "uniwind";

import { PageFade } from "@/components/scroll-fades";
import { ThemedText } from "@/components/themed-text";
import { Sheet } from "@/components/ui/sheet";
import { PlanCarousel } from "@/features/billing/components/plan-carousel";
import type { PlanModel } from "@/stores/subscription";
import { asColor } from "@/utils/colors";
import type { CreditPlan, PlanId } from "samwell-shared";

export function PlanChangeView({
  direction,
  plans,
  packages,
  catalogue,
  modelCounts,
  busy,
  loading,
  onSelectionChange,
  onChoose,
}: {
  direction: "upgrade" | "downgrade";
  plans: CreditPlan[];
  packages: Partial<Record<PlanId, PurchasesPackage>>;
  catalogue: PlanModel[];
  modelCounts: Record<PlanId, number>;
  busy: PlanId | "restore" | "manage" | null;
  loading: boolean;
  onSelectionChange: (plan: PlanId) => void;
  onChoose: (plan: PlanId, packageToBuy: PurchasesPackage) => void;
}) {
  const mutedForeground = useCSSVariable("--color-muted-foreground");
  const firstPlan = plans[0];

  if (!firstPlan) return null;

  return (
    <View className="flex-1">
      <PageFade edges="both" surface="popover">
        <Sheet.ScrollView
          className="flex-1"
          contentContainerClassName="gap-5 pb-2 pt-2"
          enableFooterMarginAdjustment
        >
          <View className="gap-1 px-6">
            <ThemedText type="headlineSm">
              {direction === "upgrade" ? "Upgrade Plan" : "Downgrade Plan"}
            </ThemedText>
            <ThemedText type="bodySm" color={asColor(mutedForeground)}>
              {direction === "upgrade"
                ? "More neurons and access to stronger brains."
                : "Your current plan stays active until the next renewal."}
            </ThemedText>
          </View>

          <PlanCarousel
            plans={plans}
            initialPlanId={firstPlan.id}
            packages={packages}
            catalogue={catalogue}
            modelCounts={modelCounts}
            busy={busy}
            loading={loading}
            showAction={false}
            showRestore={false}
            onSelectionChange={onSelectionChange}
            onChoose={onChoose}
          />
        </Sheet.ScrollView>
      </PageFade>
    </View>
  );
}
