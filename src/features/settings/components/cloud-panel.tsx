import { useIsFocused } from "expo-router/react-navigation";
import React from "react";
import { View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { useCSSVariable } from "uniwind";

import { ActionButton } from "@/components/action-button";
import { List, LogIn, RefreshCw, Settings, SlidersHorizontal } from "@/components/icons";
import { ThemedText } from "@/components/themed-text";
import { showToast } from "@/components/toast/toast-provider";
import { Card } from "@/components/ui/card";
import { GoldButton } from "@/components/ui/gold-button";
import { PrefixIcon } from "@/components/ui/prefix-icon";
import { Spinner } from "@/components/ui/spinner";
import { Touchable } from "@/components/ui/touchable";
import { ACCOUNT_ENABLED } from "@/constants/logto";
import {
    PURCHASES_ENABLED,
    REVENUECAT_TEST_STORE,
} from "@/constants/revenuecat";
import { layout } from "@/constants/theme";
import { CreditMeter } from "@/features/billing/components/credit-meter";
import { PlanPicker } from "@/features/billing/components/plan-picker";
import { SubscriptionManagementSheet } from "@/features/billing/components/subscription-management-sheet";
import { useBillingLifecycle } from "@/features/billing/hooks/use-billing-lifecycle";
import { PLAN_ICON } from "@/features/billing/utils/plan-icon";
import { usePlanCheckout } from "@/features/billing/hooks/use-plan-checkout";
import { CloudModelSheet } from "@/features/settings/components/cloud-model-sheet";
import { CloudTuneSheet } from "@/features/settings/components/cloud-tune-sheet";
import { useCloudIdentity } from "@/hooks/use-cloud-identity";
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
  onAccessActivated,
}: {
  onRequestAccount: () => void;
  onAccessActivated?: () => void;
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
  const loadPlanPreview = useSubscriptionStore((s) => s.loadPlanPreview);
  const buy = useSubscriptionStore((s) => s.purchase);
  const restore = useSubscriptionStore((s) => s.restore);
  const manage = useSubscriptionStore((s) => s.manage);
  // Counted by the server, not here. Three per tier is true today and stops
  // being true the first time `/admin/models` adds one.
  const modelCounts = useSubscriptionStore((s) => s.modelsByPlan);

  /*
   * Account or guest, in one value. This panel used to ask "is there an
   * account", which stopped being the right question the moment a device
   * could buy a plan without one: a guest who had paid went on being shown
   * the price list forever, because the branch that draws the subscribed card
   * was behind a sign-in. See `hooks/use-cloud-identity`.
   */
  const identity = useCloudIdentity();
  const hasIdentity = identity.kind === "account" || identity.kind === "guest";
  useBillingLifecycle(focused ? identity.id : null);
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
   * Ask the server what this reader holds, and the store what is on sale.
   *
   * What is on sale is asked either way. The plans have to draw for somebody
   * who has never signed in - App Review reads a price list behind a sign-in
   * wall as registration required in order to buy - and neither the store's
   * offering nor `/billing/plans` is about a person. Only the balance is, and
   * asking for that without an account is a 401 for nothing.
   */
  React.useEffect(() => {
    /*
     * Not before the stored session and the Keychain have been read. Two
     * reasons, and the second is the one that bites: `unknown` is not
     * "nobody", so acting on it would ask the anonymous route about a reader
     * who has an account; and the account store is what configures the
     * purchases SDK, so asking the store for its offering first throws and
     * leaves the cards with no prices until something else re-runs this.
     */
    if (identity.kind === "unknown") return;
    void loadOffering();
    if (hasIdentity) {
      void refresh();
      return;
    }
    void loadPlanPreview();
  }, [identity.kind, hasIdentity, refresh, loadOffering, loadPlanPreview]);

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
        if (outcome === "active") onAccessActivated?.();
        return outcome;
      }

      const purchaseError = useSubscriptionStore.getState().error;
      if (purchaseError) {
        showToast({ message: purchaseError, key: "billing" });
      }
      return false;
    },
    [buy, onAccessActivated],
  );

  const onRestore = React.useCallback(async () => {
    const restored = await restore();
    if (restored) {
      showToast({
        message: "Subscription restored.",
        tone: "success",
        key: "billing",
      });
      onAccessActivated?.();
      return;
    }

    const restoreError = useSubscriptionStore.getState().error;
    if (restoreError) {
      showToast({ message: restoreError, key: "billing" });
    }
  }, [onAccessActivated, restore]);

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

  /*
   * Everything that sells or recovers a plan goes through here rather than
   * straight to the store, because the carousel above now draws for somebody
   * who has no account yet. Signed in it is a passthrough.
   */
  const checkout = usePlanCheckout({
    buy: onChoose,
    restore: onRestore,
    onAlreadyActive: onAccessActivated,
  });
  const { start } = checkout;
  const startPurchase = React.useCallback(
    (plan: PlanId, packageToBuy: PurchasesPackage) =>
      start({ kind: "buy", plan, packageToBuy }),
    [start],
  );
  const startRestore = React.useCallback(() => start({ kind: "restore" }), [start]);
  /**
   * A purchase is under way.
   *
   * Holds this branch up while it runs. Minting a guest identity makes
   * `hasIdentity` true one render into the purchase, and without this the
   * panel would swap to the subscribed card with the store's own sheet still
   * open over it, then swap back if they changed their mind.
   */
  const checkingOut = checkout.preparing !== null;

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
   * The stored session has not been read yet.
   *
   * Its own beat, for the reason the account store documents: `unknown` is
   * not signed out, and drawing the plan carousel on it would offer a plan to
   * somebody who is already paying for one, at prices the store has not
   * answered for yet. The same quiet card the subscription check uses below.
   */
  if (identity.kind === "unknown") {
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
   * Configured, but nobody is signed in, and this build cannot sell anything
   * anyway. No carousel to draw, so it keeps the plain card and the one thing
   * left worth doing.
   */
  if (!hasIdentity && !PURCHASES_ENABLED) {
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

  /*
   * Nobody yet, and plans to sell.
   *
   * Readable, priced, with their explanation sheets, and choosing one asks
   * for nothing. The device mints its own identity at that moment and buys
   * against it; an account is offered afterwards and buys one thing, which is
   * the same plan on a second device. That is the shape App Review asked for
   * under 5.1.1(v), and it is the honest one: what is being sold is credits
   * spent on models that run on our servers, and the server can meter a phone
   * as easily as a person.
   *
   * See `usePlanCheckout` for the order, which is the part that costs money
   * to get wrong.
   */
  if (!hasIdentity || checkingOut) {
    return (
      <>
        {/* Keyed, and the branch below returns the same fragment with the
            same key, so React reconciles the two as one element instead of
            tearing this down and building it again. Without it, a checkout
            ending flips the branch, the carousel remounts, and the card the
            reader had swiped to springs back to the default. */}
        <PlanPicker
          key="plans"
          subtitle="He thinks on our servers, so a plan is a monthly balance of Neurons. Your books and highlights stay on this device."
          packages={packages}
          catalogue={catalogue}
          modelCounts={modelCounts}
          busy={checkout.preparing ?? busy}
          loading={loading}
          onChoose={startPurchase}
          onRestore={startRestore}
          surface="background"
          bleed={layout.gutter}
        />
        {/* The quiet third door, for somebody who wants neither to buy nor to
            restore: it scrolls to the account card rather than opening the
            browser from here, so sign-in still happens in one place. */}
        {!hasIdentity ? (
          <View className="items-center">
            <Touchable
              className="px-4 py-2"
              onPress={onRequestAccount}
              haptic="select"
              accessibilityRole="button"
              accessibilityLabel="Sign in to your account"
            >
              <ThemedText
                type="labelSm"
                color={asColor(mutedForeground)}
                className="tracking-[1px]"
              >
                ALREADY HAVE AN ACCOUNT
              </ThemedText>
            </Touchable>
          </View>
        ) : null}
      </>
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
  // The server never answered, so there is no plan to draw, and falling through
  // to the subscribed card would show a paying reader an empty one.
  if (status === "unreachable") {
    return (
      <Card className="gap-3 p-4">
        <View className="flex-row items-center justify-between gap-3">
          <ThemedText type="bodySm" color={asColor(mutedForeground)} className="flex-1">
            Samwell Cloud did not answer. Check your connection and try again.
          </ThemedText>
          <ActionButton
            icon={RefreshCw}
            label="TRY AGAIN"
            tint={asColor(mutedForeground)}
            onPress={() => void refresh()}
          />
        </View>
      </Card>
    );
  }

  if (status === "none" || (status === "unavailable" && PURCHASES_ENABLED)) {
    return (
      /* The fragment and the key are not decoration: see the branch above. */
      <>
        <PlanPicker
          key="plans"
          subtitle="Each one opens up the brains he can think with."
          packages={packages}
          catalogue={catalogue}
          modelCounts={modelCounts}
          /* `preparing` first, the same as the branch above: the checkout
             asks the server before it opens the store sheet, and without this
             the button went quiet for that round trip and invited a second
             tap. */
          busy={checkout.preparing ?? busy}
          loading={loading}
          onChoose={startPurchase}
          onRestore={startRestore}
          surface="background"
          bleed={layout.gutter}
        />
      </>
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
              <View className="flex-row items-center gap-3 pt-1">
                <PrefixIcon icon={PLAN_ICON[plan]} size={36} />
                <ThemedText type="bodyMd" numberOfLines={2} className="shrink">
                  {CREDIT_PLANS[plan].label}
                </ThemedText>
              </View>
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
