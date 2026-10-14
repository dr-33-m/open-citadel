import React from "react";
import { View } from "react-native";
import { useCSSVariable } from "uniwind";

import {
    RefreshCw,
    Settings,
    Ticket,
    TrendingDown,
    TrendingUp,
} from "@/components/icons";
import { PageFade } from "@/components/scroll-fades";
import { ThemedText } from "@/components/themed-text";
import { Badge } from "@/components/ui/badge";
import { GoldButton } from "@/components/ui/gold-button";
import { PrefixIcon } from "@/components/ui/prefix-icon";
import { Sheet } from "@/components/ui/sheet";
import { ManagementRow } from "@/features/billing/components/management-row";
import { PLAN_ICON } from "@/features/billing/utils/plan-icon";
import type { PlanStanding } from "@/features/billing/utils/plan-standing";
import { asColor } from "@/utils/colors";
import { CREDIT_PLANS, type PlanId } from "samwell-shared";

export type PlanManageViewProps = {
  plan: PlanId;
  /** Bought or given, and every word that depends on which. See `planStanding`. */
  standing: PlanStanding;
  canUpgrade: boolean;
  canDowngrade: boolean;
  busy: PlanId | "restore" | "manage" | null;
  /** Say what the Test Store does in place of a cancellation page. */
  testStore: boolean;
  onUpgrade: () => void;
  onDowngrade: () => void;
  onRestore: () => void;
  onManage: () => void;
  /** Redeem another insider code. Only offered on an insider plan. */
  onInsiderCode: () => void;
};

/**
 * The plan somebody is on, and what can be done about it: the first face of
 * the management sheet, before a plan change takes its place.
 *
 * A bought plan has the store's rows under it (downgrade, restore, manage or
 * cancel). An insider plan has no store behind it, so none of those: nothing
 * to restore, downgrade or cancel. What can be done is to put a newer code
 * in its place, or to buy a plan over it.
 */
export function PlanManageView({
  plan,
  standing,
  canUpgrade,
  canDowngrade,
  busy,
  testStore,
  onUpgrade,
  onDowngrade,
  onRestore,
  onManage,
  onInsiderCode,
}: PlanManageViewProps) {
  const mutedForeground = asColor(useCSSVariable("--color-muted-foreground"));
  const controlsDisabled = busy !== null;
  const testStoreNote = testStore && !standing.insider;
  const buyingReplaces = standing.insider && canUpgrade;

  return (
    <PageFade edges="both" surface="popover">
      <Sheet.ScrollView contentContainerClassName="gap-5 px-6 pb-2 pt-2">
        <View className="gap-1">
          <ThemedText type="headlineSm">{standing.title}</ThemedText>
          <ThemedText type="bodySm" color={mutedForeground}>
            {standing.subtitle}
          </ThemedText>
        </View>

        <View className="gap-2 bg-muted p-4">
          <View className="flex-row items-center justify-between gap-3">
            <ThemedText type="labelSm" color={mutedForeground}>
              CURRENT PLAN
            </ThemedText>
            <Badge variant={standing.tone}>{standing.badge}</Badge>
          </View>
          <View className="flex-row items-center gap-3">
            <PrefixIcon icon={PLAN_ICON[plan]} size={36} />
            <ThemedText type="headlineSm" className="shrink">
              {CREDIT_PLANS[plan].label}
            </ThemedText>
          </View>
          <ThemedText type="bodySm" color={mutedForeground}>
            {standing.detail}
          </ThemedText>
        </View>

        {canUpgrade ? (
          <GoldButton
            label="UPGRADE PLAN"
            icon={TrendingUp}
            size="compact"
            disabled={controlsDisabled}
            onPress={onUpgrade}
          />
        ) : (
          <ThemedText type="bodySm" color={mutedForeground}>
            You are on the highest plan.
          </ThemedText>
        )}

        {standing.insider ? (
          <View className="gap-3">
            {buyingReplaces ? (
              <ThemedText type="bodySm" color={mutedForeground}>
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
            {canDowngrade ? (
              <ManagementRow
                icon={TrendingDown}
                label="Downgrade plan"
                detail="Choose a lower plan for your next renewal"
                busy={false}
                disabled={controlsDisabled}
                onPress={onDowngrade}
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

        {testStoreNote ? (
          <ThemedText type="bodySm" color={mutedForeground}>
            RevenueCat Test Store has no App Store or Play cancellation page.
            Monthly test plans renew every five minutes and cancel
            automatically after the fifth renewal.
          </ThemedText>
        ) : null}
      </Sheet.ScrollView>
    </PageFade>
  );
}
