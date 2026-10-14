import { Cloud, Smartphone } from "@/components/icons";
import React from "react";
import { View } from "react-native";
import { useCSSVariable } from "uniwind";

import { KeptAlive } from "@/components/kept-alive";
import { ModeCard } from "@/components/mode-card";
import {
    EngineInfoSheet,
    type EngineMode,
} from "@/components/settings/engine-info-sheet";
import { ThemedText } from "@/components/themed-text";
import { ACCOUNT_ENABLED } from "@/constants/logto";
import { getCloudBlocker } from "@/features/chat/utils/cloud-access";
import { PURCHASES_ENABLED } from "@/constants/revenuecat";
import { useCloudIdentity } from "@/hooks/use-cloud-identity";
import {
    InsiderCodeHost,
    type InsiderCodeHandle,
} from "@/features/billing/components/insider-code-host";
import { CloudPanel } from "@/features/settings/components/cloud-panel";
import { OfflineModelCard } from "@/features/settings/components/offline-model-card";
import { useSettledOnce } from "@/navigation/use-settled-once";
import { isExecuTorchAvailable } from "@/lib/executorch";
import { useSettingsStore } from "@/stores/settings";
import { useSubscriptionStore } from "@/stores/subscription";
import { asColor } from "@/utils/colors";

/**
 * Samwell's settings: which engine answers, and its controls. Each panel
 * owns its own sheets; this component only decides which panel is showing.
 *
 * Both panels are kept once drawn (`KeptAlive`) and the one not showing is
 * built ahead, once nothing is moving. So choosing the other engine reveals a
 * panel that already exists: the card answers on the press, and the plans are
 * simply there rather than arriving behind a placeholder each time.
 */
export const SamwellSection = React.memo(function SamwellSection({
  onRequestAccount,
  initialMode,
}: {
  /** Go to the Profile page: the cloud panel's way out when there is no
   *  account yet. Owned by the route, which holds the router. */
  onRequestAccount: () => void;
  /** Panel to reveal from a targeted Settings deep link. */
  initialMode?: EngineMode;
}) {
  const mutedForeground = useCSSVariable("--color-muted-foreground");
  const samwellMode = useSettingsStore((s) => s.samwellMode);
  const setSamwellMode = useSettingsStore((s) => s.setSamwellMode);
  const cloudBaseUrl = useSettingsStore((s) => s.cloudBaseUrl);
  const identity = useCloudIdentity();
  const subscriptionStatus = useSubscriptionStore((s) => s.status);
  const [infoSheet, setInfoSheet] = React.useState<EngineMode | null>(null);
  const [previewMode, setPreviewMode] = React.useState<EngineMode | null>(() =>
    initialMode && initialMode !== samwellMode ? initialMode : null,
  );
  const nativeAvailable = React.useMemo(() => isExecuTorchAvailable(), []);
  const displayedMode = previewMode ?? samwellMode;
  // The cards answer the press; the panel under them follows a beat behind
  // when it has to be built first, so building it never holds the press up.
  const shownMode = React.useDeferredValue(displayedMode);
  const landed = useSettledOnce();
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

  // Opened through a ref, so a code being typed redraws its sheet and not
  // this section with both of its panels.
  const insiderCode = React.useRef<InsiderCodeHandle>(null);
  const openInsiderCode = React.useCallback(
    () => insiderCode.current?.open(),
    [],
  );

  // A plan that lands while Cloud is only being looked at makes the look the
  // choice. A payment that confirms a moment late reports no "active" for the
  // panel to act on, and left a new subscriber on the device with the Cloud
  // card lit. Only from "no plan", so arriving here by a link never switches.
  const lastBlocker = React.useRef(cloudBlocker);
  React.useEffect(() => {
    const planArrived = lastBlocker.current === "needsPlan" && cloudAccessReady;
    lastBlocker.current = cloudBlocker;
    if (planArrived && previewMode === "cloud") activateCloud();
  }, [cloudBlocker, cloudAccessReady, previewMode, activateCloud]);

  return (
    <View className="gap-4">
      <View className="flex-row gap-3" accessibilityRole="radiogroup">
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

      <KeptAlive active={shownMode === "offline"} warm={landed} className="gap-4">
        {nativeAvailable ? (
          <OfflineModelCard />
        ) : (
          <ThemedText type="bodySm" color={asColor(mutedForeground)}>
            On-device Samwell is not supported on this phone. Choose Cloud to
            talk to him.
          </ThemedText>
        )}
      </KeptAlive>
      <KeptAlive active={shownMode === "cloud"} warm={landed} className="gap-4">
        <CloudPanel
          onRequestAccount={onRequestAccount}
          onInsiderCode={openInsiderCode}
          onAccessActivated={activateCloud}
        />
      </KeptAlive>

      <EngineInfoSheet mode={infoSheet} onClose={() => setInfoSheet(null)} />
      <InsiderCodeHost ref={insiderCode} onActivated={activateCloud} />
    </View>
  );
});
