import { useIsFocused } from "expo-router/react-navigation";
import React from "react";
import { View } from "react-native";
import { useCSSVariable } from "uniwind";

import { ActionButton } from "@/components/action-button";
import { useOnScreen } from "@/components/kept-alive";
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
import { usePlanSale } from "@/features/billing/hooks/use-plan-sale";
import { CloudModelSheet } from "@/features/settings/components/cloud-model-sheet";
import { CloudTuneSheet } from "@/features/settings/components/cloud-tune-sheet";
import { useCloudIdentity } from "@/hooks/use-cloud-identity";
import { useSettingsStore } from "@/stores/settings";
import { useSubscriptionStore } from "@/stores/subscription";
import { asColor } from "@/utils/colors";
import { CREDIT_PLANS, PLANS, planRank } from "samwell-shared";

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
  // This panel is kept while the on-device one shows (`KeptAlive`), and
  // nothing about a balance needs asking while it is put away.
  const onScreen = useOnScreen();
  const focused = useIsFocused() && onScreen;
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
  const lifecycle = useSubscriptionStore((s) => s.lifecycle);
  const busy = useSubscriptionStore((s) => s.busy);
  const loading = useSubscriptionStore((s) => s.loading);
  const error = useSubscriptionStore((s) => s.error);
  const refresh = useSubscriptionStore((s) => s.refresh);
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
  /*
   * What is on sale and what each plan holds, from TanStack Query and
   * usually already cached: see `usePlanOffer`, inside `usePlanSale`, which
   * also holds the purchase, the restore and the checkout. Not before the identity has
   * settled, because the account store is what configures the purchases SDK.
   */
  const sale = usePlanSale({
    enabled: identity.kind !== "unknown",
    onActivated: onAccessActivated,
  });
  const { offer, onChoose, onRestore } = sale;
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
   * Ask the server what this reader holds. Only the balance is about a
   * person, and asking for it without an account is a 401 for nothing; what
   * is on sale is `usePlanOffer`'s, above, and asked either way.
   */
  React.useEffect(() => {
    if (hasIdentity && onScreen) void refresh();
  }, [hasIdentity, onScreen, refresh]);
  const { packages } = offer;

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

  /**
   * A purchase is under way.
   *
   * Holds this branch up while it runs. Minting a guest identity makes
   * `hasIdentity` true one render into the purchase, and without this the
   * panel would swap to the subscribed card with the store's own sheet still
   * open over it, then swap back if they changed their mind.
   */
  const checkingOut = sale.checkingOut;

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
          subtitle="Monthly Neurons for Samwell's cloud brains. No account needed."
          packages={packages}
          catalogue={offer.catalogue}
          modelCounts={offer.modelCounts}
          voicesByPlan={offer.voicesByPlan}
          busy={sale.picker.busy}
          ready={offer.ready}
          prebuilt
          failed={offer.failed}
          onRetry={offer.retry}
          onChoose={sale.picker.onChoose}
          onRestore={sale.picker.onRestore}
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

  if (PURCHASES_ENABLED && (status === "none" || status === "unavailable")) {
    return (
      /* The fragment and the key are not decoration: see the branch above. */
      <>
        <PlanPicker
          key="plans"
          subtitle="Each one opens up the brains he can think with."
          packages={packages}
          catalogue={offer.catalogue}
          modelCounts={offer.modelCounts}
          voicesByPlan={offer.voicesByPlan}
          /* `preparing` first, the same as the branch above: the checkout
             asks the server before it opens the store sheet, and without this
             the button went quiet for that round trip and invited a second
             tap. */
          busy={sale.picker.busy}
          ready={offer.ready}
          prebuilt
          failed={offer.failed}
          onRetry={offer.retry}
          onChoose={sale.picker.onChoose}
          onRestore={sale.picker.onRestore}
          surface="background"
          bleed={layout.gutter}
        />
      </>
    );
  }

  // Reached with `none` only when this build cannot sell: no carousel of
  // prices that will never come.
  if (status === "unavailable" || status === "none") {
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
          onClose={() => setManageVisible(false)}
          onChoose={onChoose}
          onRestore={onRestore}
          onManage={onManage}
        />
      ) : null}
    </>
  );
}
