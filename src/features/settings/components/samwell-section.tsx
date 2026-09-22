import { Cloud, Info, Smartphone, type LucideIcon } from "@/components/icons";
import React from "react";
import { Pressable, View } from "react-native";
import { useCSSVariable } from "uniwind";

import { SamwellText } from "@/components/samwell-text";
import {
    EngineInfoSheet,
    type EngineMode,
} from "@/components/settings/engine-info-sheet";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/card";
import { PrefixIcon } from "@/components/ui/prefix-icon";
import { Touchable } from "@/components/ui/touchable";
import { ACCOUNT_ENABLED } from "@/constants/logto";
import { useForgetDeviceLink } from "@/features/billing/hooks/use-forget-device-link";
import { getCloudBlocker } from "@/features/chat/utils/cloud-access";
import { PURCHASES_ENABLED } from "@/constants/revenuecat";
import { useCloudIdentity } from "@/hooks/use-cloud-identity";
import { CloudPanel } from "@/features/settings/components/cloud-panel";
import { OfflineModelCard } from "@/features/settings/components/offline-model-card";
import { SettingsSection } from "@/features/settings/components/settings-section";
import { cn } from "@/lib/cn";
import { isNativeAvailable } from "@/services/inference";
import { useSettingsStore } from "@/stores/settings";
import { useSubscriptionStore } from "@/stores/subscription";
import { asColor } from "@/utils/colors";

/** Long enough that nobody resting a thumb on the heading trips it. */
const FORGET_LINK_HOLD_MS = 3_000;

/**
 * The Samwell group: which engine answers, and its controls. Each panel
 * owns its own sheets — this component only decides which panel exists.
 */
export const SamwellSection = React.memo(function SamwellSection({
  onRequestAccount,
  initialMode,
}: {
  /** Bring the Profile section into view — the cloud panel's way out when
   *  there is no account yet. Owned by the route, which holds the scroller. */
  onRequestAccount: () => void;
  /** Panel to reveal from a targeted Settings deep link. */
  initialMode?: EngineMode;
}) {
  const [primary, mutedForeground] = useCSSVariable([
    "--color-primary",
    "--color-muted-foreground",
  ]);
  const samwellMode = useSettingsStore((s) => s.samwellMode);
  const setSamwellMode = useSettingsStore((s) => s.setSamwellMode);
  const cloudBaseUrl = useSettingsStore((s) => s.cloudBaseUrl);
  const identity = useCloudIdentity();
  const subscriptionStatus = useSubscriptionStore((s) => s.status);
  const [infoSheet, setInfoSheet] = React.useState<EngineMode | null>(null);
  const [previewMode, setPreviewMode] = React.useState<EngineMode | null>(() =>
    initialMode && initialMode !== samwellMode ? initialMode : null,
  );
  const nativeAvailable = React.useMemo(() => isNativeAvailable(), []);
  const forgetDeviceLink = useForgetDeviceLink();
  const displayedMode = previewMode ?? samwellMode;
  const cloudBlocker = getCloudBlocker({
    configured: cloudBaseUrl.length > 0 && ACCOUNT_ENABLED,
    identity: identity.kind,
    purchasable: PURCHASES_ENABLED,
    subscriptionStatus,
    mode: samwellMode,
  });
  const cloudAccessReady =
    cloudBlocker === null || cloudBlocker === "offlineMode";

  const selectOffline = React.useCallback(() => {
    setPreviewMode(null);
    void setSamwellMode("offline");
  }, [setSamwellMode]);

  const selectCloud = React.useCallback(() => {
    if (cloudAccessReady) {
      setPreviewMode(null);
      void setSamwellMode("cloud");
      return;
    }
    setPreviewMode("cloud");
  }, [cloudAccessReady, setSamwellMode]);

  const activateCloud = React.useCallback(() => {
    setPreviewMode(null);
    void setSamwellMode("cloud");
  }, [setSamwellMode]);

  return (
    <SettingsSection>
      {/* A long hold on the heading is a tester's reset. See the hook. */}
      <Pressable
        className="gap-1"
        onLongPress={forgetDeviceLink}
        delayLongPress={FORGET_LINK_HOLD_MS}
        accessible={false}
      >
        <ThemedText
          type="labelMd"
          color={asColor(primary)}
          className="tracking-[1.2px]"
        >
          {displayedMode === "cloud" ? "SAMWELL CLOUD" : "SAMWELL"}
        </ThemedText>
        <ThemedText type="bodySm" color={asColor(mutedForeground)}>
          {displayedMode === "cloud"
            ? "Puts your knowledge to work."
            : "Your reading companion"}
        </ThemedText>
      </Pressable>

      {/* Mode cards */}
      <View className="flex-row gap-3">
        <ModeCard
          active={displayedMode === "offline"}
          icon={Smartphone}
          label="On-device"
          description="Samwell on your device."
          onSelect={selectOffline}
          onInfo={() => setInfoSheet("offline")}
        />
        <ModeCard
          active={displayedMode === "cloud"}
          icon={Cloud}
          label="Cloud"
          description="Samwell in the cloud."
          onSelect={selectCloud}
          onInfo={() => setInfoSheet("cloud")}
        />
      </View>

      {displayedMode === "cloud" ? (
        <CloudPanel
          onRequestAccount={onRequestAccount}
          onAccessActivated={activateCloud}
        />
      ) : !nativeAvailable ? (
        <ThemedText type="bodySm" color={asColor(mutedForeground)}>
          On-device AI is not supported on this device. Grand Maester Samwell is
          on the way. Check back soon.
        </ThemedText>
      ) : (
        <OfflineModelCard />
      )}

      <EngineInfoSheet mode={infoSheet} onClose={() => setInfoSheet(null)} />
    </SettingsSection>
  );
});

function ModeCard({
  active,
  icon,
  label,
  description,
  onSelect,
  onInfo,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  description: string;
  onSelect: () => void;
  onInfo: () => void;
}) {
  const [primary, mutedForeground] = useCSSVariable([
    "--color-primary",
    "--color-muted-foreground",
  ]);
  return (
    <Touchable className="flex-1" onPress={onSelect}>
      {/* `flex-1` on the card, not just on the Touchable around it. The row
          stretches both Touchables to the taller of the two, but the card
          inside still sized to its own text, so the one-line description left
          a card visibly shorter than the two-line one beside it. */}
      <Card className={cn("flex-1 gap-2 p-4", active && "border-primary")}>
        <View className="flex-row items-center gap-3">
          <PrefixIcon
            icon={icon}
            size={36}
            color={active ? asColor(primary) : undefined}
          />
          <ThemedText
            type="bodyMd"
            color={active ? asColor(primary) : undefined}
          >
            {label}
          </ThemedText>
        </View>
        {/* His name in gold here as everywhere else. These two lines were
            missed by the first sweep because they arrive as a prop rather than
            as literal text in the JSX. */}
        <SamwellText type="bodySm" color={asColor(mutedForeground)}>
          {description}
        </SamwellText>
        <Touchable
          className="absolute right-2 top-2"
          onPress={onInfo}
          hitSlop={10}
        >
          <Info size={15} color={asColor(mutedForeground)} />
        </Touchable>
      </Card>
    </Touchable>
  );
}
