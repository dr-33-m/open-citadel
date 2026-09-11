import { useIsFocused } from "expo-router/react-navigation";
import React from "react";
import { View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { useCSSVariable } from "uniwind";

import { ActionButton } from "@/components/action-button";
import { List, LogIn, Settings, SlidersHorizontal } from "@/components/icons";
import { ThemedText } from "@/components/themed-text";
import { showToast } from "@/components/toast/toast-provider";
import { Card } from "@/components/ui/card";
import { GoldButton } from "@/components/ui/gold-button";
import { Spinner } from "@/components/ui/spinner";
import { ACCOUNT_ENABLED } from "@/constants/logto";
import {
    PURCHASES_ENABLED,
    REVENUECAT_TEST_STORE,
} from "@/constants/revenuecat";
import { CreditMeter } from "@/features/billing/components/credit-meter";
import { PlanCarousel } from "@/features/billing/components/plan-carousel";
import { SubscriptionManagementSheet } from "@/features/billing/components/subscription-management-sheet";
import { useBillingLifecycle } from "@/features/billing/hooks/use-billing-lifecycle";
import { CloudModelSheet } from "@/features/settings/components/cloud-model-sheet";
import { CloudTuneSheet } from "@/features/settings/components/cloud-tune-sheet";
import { useAccountStore } from "@/stores/account";
import { useSettingsStore } from "@/stores/settings";
import { useSubscriptionStore } from "@/stores/subscription";
import { asColor } from "@/utils/colors";
import {
    CREDIT_PLANS,
    PLANS,
    planForPackage,
    planRank,
    type PlanId,
} from "samwell-shared";

/**
 * The cloud engine's panel.
 *
 * Composition and a branch, and nothing else. It owns which settled state the
 * reader is in - this build cannot reach the cloud, nobody is signed in,
 * signed in without a plan, or set up - plus the brief check before that state
 * is known, and hands each one to the piece that draws it. Everything with
 * logic in it lives in `features/billing`.
 */
export function CloudPanel({
  onRequestAccount,
}: {
  onRequestAccount: () => void;
}) {
  const focused = useIsFocused();
  const [mutedForeground, primary] = useCSSVariable([
    "--color-muted-foreground",
    "--color-primary",
  ]);
  const cloudBaseUrl = useSettingsStore((s) => s.cloudBaseUrl);
  const cloudModelId = useSettingsStore((s) => s.cloudModelId);
  const setCloudModelId = useSettingsStore((s) => s.setCloudModelId);

  // Per-field, never the whole store: a credit spent mid-conversation must
  // not redraw this panel's every child.
  const status = useSubscriptionStore((s) => s.status);
  const plan = useSubscriptionStore((s) => s.plan);
  const models = useSubscriptionStore((s) => s.models);
  const catalogue = useSubscriptionStore((s) => s.catalogue);
  const balance = useSubscriptionStore((s) => s.balance);
  const offering = useSubscriptionStore((s) => s.offering);
  const lifecycle = useSubscriptionStore((s) => s.lifecycle);
  const busy = useSubscriptionStore((s) => s.busy);
  const loading = useSubscriptionStore((s) => s.loading);
  const error = useSubscriptionStore((s) => s.error);
  const refresh = useSubscriptionStore((s) => s.refresh);
  const loadOffering = useSubscriptionStore((s) => s.loadOffering);
  const buy = useSubscriptionStore((s) => s.purchase);
  const restore = useSubscriptionStore((s) => s.restore);
  const manage = useSubscriptionStore((s) => s.manage);
  // Counted by the server, not here. Three per tier is true today and stops
  // being true the first time `/admin/models` adds one.
  const modelCounts = useSubscriptionStore((s) => s.modelsByPlan);

  const accountId = useAccountStore((state) =>
    state.status === "signedIn" ? state.sub : null,
  );
  const signedIn = accountId !== null;
  useBillingLifecycle(focused ? accountId : null);
  const [pickerVisible, setPickerVisible] = React.useState(false);
  const [tuneVisible, setTuneVisible] = React.useState(false);
  const [manageVisible, setManageVisible] = React.useState(false);
  const activeModel = models.find((m) => m.id === cloudModelId);
  const upgradePlans = React.useMemo(
    () =>
      plan === null
        ? []
        : PLANS.filter((candidate) => planRank(candidate.id) > planRank(plan)),
    [plan],
  );
  const downgradePlans = React.useMemo(
    () =>
      plan === null
        ? []
        : PLANS.filter(
            (candidate) => planRank(candidate.id) < planRank(plan),
          ).reverse(),
    [plan],
  );

  /*
   * Ask the server what this account holds, and the store what is on sale.
   *
   * Only once signed in: both answers are about an account, and asking
   * without one produces a 401 and an anonymous customer for nothing.
   */
  React.useEffect(() => {
    if (!signedIn) return;
    void refresh();
    void loadOffering();
  }, [signedIn, refresh, loadOffering]);

  /** The store package behind each plan, keyed exactly. See `planForPackage`. */
  const packages = React.useMemo(() => {
    const out: Partial<Record<PlanId, PurchasesPackage>> = {};
    for (const pkg of offering?.availablePackages ?? []) {
      const plan = planForPackage(pkg.identifier);
      if (plan) out[plan] = pkg;
    }
    return out;
  }, [offering]);

  /**
   * Report what the store did, and nothing else. Closing the management sheet
   * is the sheet's own call: it is the thing that knows a change is in
   * flight, and hiding it from out here mid-purchase left it on screen and
   * unable to answer anything.
   */
  const onChoose = React.useCallback(
    async (plan: PlanId, packageToBuy: PurchasesPackage) => {
      const outcome = await buy(packageToBuy, plan);
      if (outcome) {
        showToast({
          message:
            outcome === "scheduled"
              ? `${CREDIT_PLANS[plan].label} will begin at your next renewal.`
              : outcome === "pending"
                ? "Payment went through. Your plan will appear shortly."
                : `${CREDIT_PLANS[plan].label} is yours.`,
          tone: "success",
          key: "billing",
        });
        return outcome;
      }

      const purchaseError = useSubscriptionStore.getState().error;
      if (purchaseError) {
        showToast({ message: purchaseError, key: "billing" });
      }
      return false;
    },
    [buy],
  );

  const onRestore = React.useCallback(async () => {
    const restored = await restore();
    if (restored) {
      showToast({
        message: "Subscription restored.",
        tone: "success",
        key: "billing",
      });
      return;
    }

    const restoreError = useSubscriptionStore.getState().error;
    if (restoreError) {
      showToast({ message: restoreError, key: "billing" });
    }
  }, [restore]);

  const onManage = React.useCallback(async () => {
    const result = await manage();
    if (result === "test-store") {
      showToast({
        message:
          "Test Store monthly plans cancel automatically after five renewals, about 25 minutes.",
        key: "billing",
      });
      return;
    }
    if (result === false) {
      const manageError = useSubscriptionStore.getState().error;
      if (manageError) showToast({ message: manageError, key: "billing" });
    }
  }, [manage]);

  // This build cannot reach him, and no amount of signing in changes that.
  if (!cloudBaseUrl || !ACCOUNT_ENABLED) {
    return (
      <Card className="gap-3 p-4">
        <ThemedText type="bodySm" color="#f97316" style={{ fontSize: 11 }}>
          Grand Maester Samwell is not set up in this build yet.
        </ThemedText>
      </Card>
    );
  }

  /*
   * Configured, but nobody is signed in.
   *
   * Unchanged: a plan is bought against an account, so the account comes
   * first and this stays the single thing worth doing. The button does not
   * open the browser from here - sign-in lives in one place and this scrolls
   * to it.
   */
  if (!signedIn) {
    return (
      <Card className="gap-4 p-4">
        <View className="gap-1">
          <ThemedText type="bodyMd">Requires a cloud account</ThemedText>
          <ThemedText type="bodySm" color={asColor(mutedForeground)}>
            His work is counted against your account.
          </ThemedText>
        </View>
        <View className="flex-row">
          <GoldButton
            label="SIGN IN"
            icon={LogIn}
            size="small"
            onPress={onRequestAccount}
          />
        </View>
      </Card>
    );
  }

  // Do not draw fragments of the subscribed card while the server is still
  // deciding whether this account should see that card or the plan carousel.
  if (status === "unknown") {
    return (
      <Card className="p-4">
        <View className="flex-row items-center gap-2">
          <Spinner size="sm" />
          <ThemedText type="bodySm" color={asColor(mutedForeground)}>
            Checking subscription
          </ThemedText>
        </View>
      </Card>
    );
  }

  /*
   * Signed in, no plan yet.
   *
   * `unknown` is deliberately not this branch. It is the moment before the
   * server has answered, and showing a plan carousel to somebody who is
   * already paying - on every cold open - is exactly the flash the account
   * store's own three states exist to prevent.
   *
   * On the surface, not in a card of its own - the same judgement the text
   * to speech section makes. The slides are cards because they are the
   * things being compared; the section around them is the page, and a card
   * inside the section inside the screen was one box too many.
   */
  if (status === "none" || (status === "unavailable" && PURCHASES_ENABLED)) {
    return (
      <View className="gap-4">
        <View className="gap-1">
          <ThemedText type="bodyMd">Choose a plan</ThemedText>
          <ThemedText type="bodySm" color={asColor(mutedForeground)}>
            Each one opens up the brains he can think with.
          </ThemedText>
        </View>
        <PlanCarousel
          packages={packages}
          catalogue={catalogue}
          modelCounts={modelCounts}
          busy={busy}
          loading={loading}
          onChoose={onChoose}
          onRestore={onRestore}
        />
      </View>
    );
  }

  if (status === "unavailable") {
    return (
      <Card className="gap-3 p-4">
        <ThemedText type="bodySm" color="#f97316" style={{ fontSize: 11 }}>
          Subscriptions are not set up in this build yet.
        </ThemedText>
      </Card>
    );
  }

  return (
    <>
      <Card className="gap-3 p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>
              BRAIN
            </ThemedText>
            {/* The subscription check has settled before this card mounts, so
                a missing active model now means there is genuinely no match. */}
            {activeModel ? (
              <ThemedText type="bodyMd" numberOfLines={2}>
                {activeModel.label}
              </ThemedText>
            ) : (
              <ThemedText type="bodyMd" numberOfLines={2}>
                Choose a brain
              </ThemedText>
            )}
          </View>
          <View className="flex-row gap-2">
            <ActionButton
              icon={SlidersHorizontal}
              label="TUNE"
              tint={asColor(mutedForeground)}
              onPress={() => setTuneVisible(true)}
            />
            <ActionButton
              icon={List}
              label="CHANGE"
              tint={asColor(mutedForeground)}
              onPress={() => setPickerVisible(true)}
              accessibilityLabel="Change the brain"
            />
          </View>
        </View>

        <CreditMeter
          balance={balance}
          lifecycle={lifecycle}
          loading={loading}
          error={error}
          onRefresh={() => void refresh()}
        />

        {plan ? (
          <View className="flex-row flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <View className="min-w-0 flex-1 gap-0.5">
              <ThemedText type="labelSm" color={asColor(mutedForeground)}>
                CURRENT PLAN
              </ThemedText>
              <ThemedText type="bodyMd" numberOfLines={2}>
                {CREDIT_PLANS[plan].label}
              </ThemedText>
            </View>
            <ActionButton
              icon={Settings}
              label="MANAGE PLAN"
              tint={asColor(mutedForeground)}
              onPress={() => setManageVisible(true)}
            />
          </View>
        ) : null}
      </Card>

      <CloudModelSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={(id) => {
          setCloudModelId(id);
          setPickerVisible(false);
        }}
        activeId={cloudModelId}
        models={models}
        plan={plan}
        mutedForeground={asColor(mutedForeground)}
        primary={asColor(primary)}
      />

      <CloudTuneSheet
        visible={tuneVisible}
        onClose={() => setTuneVisible(false)}
      />

      {plan ? (
        <SubscriptionManagementSheet
          visible={manageVisible}
          plan={plan}
          lifecycle={lifecycle}
          upgradePlans={upgradePlans}
          downgradePlans={downgradePlans}
          packages={packages}
          catalogue={catalogue}
          modelCounts={modelCounts}
          testStore={REVENUECAT_TEST_STORE}
          busy={busy}
          loading={loading}
          onClose={() => setManageVisible(false)}
          onChoose={onChoose}
          onRestore={onRestore}
          onManage={onManage}
        />
      ) : null}
    </>
  );
}
