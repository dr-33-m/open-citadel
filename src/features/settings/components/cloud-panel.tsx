import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { PurchasesPackage } from 'react-native-purchases';

import { ActionButton } from '@/components/action-button';
import { List, LogIn, SlidersHorizontal } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { showToast } from '@/components/toast/toast-provider';
import { Card } from '@/components/ui/card';
import { GoldButton } from '@/components/ui/gold-button';
import { Spinner } from '@/components/ui/spinner';
import { ACCOUNT_ENABLED } from '@/constants/logto';
import { PURCHASES_ENABLED } from '@/constants/revenuecat';
import { CloudTuneSheet } from '@/features/settings/components/cloud-tune-sheet';
import { CloudModelSheet } from '@/features/settings/components/cloud-model-sheet';
import { CreditMeter } from '@/features/billing/components/credit-meter';
import { PlanCarousel } from '@/features/billing/components/plan-carousel';
import { useSignedIn } from '@/stores/account';
import { useSettingsStore } from '@/stores/settings';
import { useSubscriptionStore } from '@/stores/subscription';
import { CREDIT_PLANS, planForPackage, type PlanId } from 'samwell-shared';
import { asColor } from '@/utils/colors';

/**
 * The cloud engine's panel.
 *
 * Composition and a branch, and nothing else. It owns which of four states
 * the reader is in - this build cannot reach the cloud, nobody is signed in,
 * signed in without a plan, or set up - and hands each one to the piece that
 * draws it. Everything with logic in it lives in `features/billing`.
 */
export function CloudPanel({ onRequestAccount }: { onRequestAccount: () => void }) {
  const [mutedForeground, primary] = useCSSVariable([
    '--color-muted-foreground',
    '--color-primary',
  ]);
  const cloudBaseUrl = useSettingsStore((s) => s.cloudBaseUrl);
  const cloudModelId = useSettingsStore((s) => s.cloudModelId);
  const setCloudModelId = useSettingsStore((s) => s.setCloudModelId);

  // Per-field, never the whole store: a credit spent mid-conversation must
  // not redraw this panel's every child.
  const status = useSubscriptionStore((s) => s.status);
  const models = useSubscriptionStore((s) => s.models);
  const balance = useSubscriptionStore((s) => s.balance);
  const offering = useSubscriptionStore((s) => s.offering);
  const busy = useSubscriptionStore((s) => s.busy);
  const loading = useSubscriptionStore((s) => s.loading);
  const error = useSubscriptionStore((s) => s.error);
  const refresh = useSubscriptionStore((s) => s.refresh);
  const loadOffering = useSubscriptionStore((s) => s.loadOffering);
  const buy = useSubscriptionStore((s) => s.purchase);
  const restore = useSubscriptionStore((s) => s.restore);
  // Counted by the server, not here. Three per tier is true today and stops
  // being true the first time `/admin/models` adds one.
  const modelCounts = useSubscriptionStore((s) => s.modelsByPlan);

  const signedIn = useSignedIn();
  const [pickerVisible, setPickerVisible] = React.useState(false);
  const [tuneVisible, setTuneVisible] = React.useState(false);
  const activeModel = models.find((m) => m.id === cloudModelId);

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


  const onChoose = React.useCallback(
    async (plan: PlanId, packageToBuy: PurchasesPackage) => {
      const bought = await buy(packageToBuy, plan);
      if (bought) {
        showToast({
          message: `${CREDIT_PLANS[plan].label} is yours.`,
          tone: 'success',
          key: 'billing',
        });
      }
    },
    [buy],
  );

  const onRestore = React.useCallback(async () => {
    const restored = await restore();
    if (restored) {
      showToast({ message: 'Subscription restored.', tone: 'success', key: 'billing' });
    }
  }, [restore]);

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
          <GoldButton label="SIGN IN" icon={LogIn} size="small" onPress={onRequestAccount} />
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
   */
  if (status === 'none' || (status === 'unavailable' && PURCHASES_ENABLED)) {
    return (
      <Card className="gap-4 p-4">
        <View className="gap-1">
          <ThemedText type="bodyMd">Choose a plan</ThemedText>
          <ThemedText type="bodySm" color={asColor(mutedForeground)}>
            Each one opens up the models he can think with.
          </ThemedText>
        </View>
        <PlanCarousel
          packages={packages}
          modelCounts={modelCounts}
          busy={busy}
          loading={loading}
          error={error}
          onChoose={onChoose}
          onRestore={onRestore}
        />
      </Card>
    );
  }

  if (status === 'unavailable') {
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
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>MODEL</ThemedText>
            {/* Three states, not two. "Choose a model" is only honest once
                the list is in and the stored id genuinely matches nothing. */}
            {activeModel ? (
              <ThemedText type="bodyMd" numberOfLines={2}>
                {activeModel.label}
              </ThemedText>
            ) : status === 'unknown' ? (
              <View className="py-1">
                <Spinner size="sm" label="Checking which model is active" />
              </View>
            ) : (
              <ThemedText type="bodyMd" numberOfLines={2}>
                Choose a model
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
              accessibilityLabel="Change the model"
            />
          </View>
        </View>

        <CreditMeter
          balance={balance}
          loading={loading}
          error={error}
          onRefresh={() => void refresh()}
        />
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
        mutedForeground={asColor(mutedForeground)}
        primary={asColor(primary)}
      />

      <CloudTuneSheet visible={tuneVisible} onClose={() => setTuneVisible(false)} />
    </>
  );
}
