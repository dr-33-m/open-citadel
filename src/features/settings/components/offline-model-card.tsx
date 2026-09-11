import {
    Download,
    List,
    MemoryStick,
    Power,
    SlidersHorizontal,
    Trash2,
} from "@/components/icons";
import React from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import { useCSSVariable } from "uniwind";

import { ActionButton } from "@/components/action-button";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/card";
import { Touchable } from "@/components/ui/touchable";
import { ConfirmDeleteSheet } from "@/features/settings/components/confirm-delete-sheet";
import { MemoryInfoSheet } from "@/features/settings/components/memory-info-sheet";
import { ModelPickerSheet } from "@/features/settings/components/model-picker-sheet";
import { TuneSheet } from "@/features/settings/components/tune-sheet";
import { useModelSheet } from "@/features/settings/hooks/use-model-sheet";
import { usePulse } from "@/hooks/use-pulse";
import { useModelStore } from "@/stores/model";
import { asColor } from "@/utils/colors";
import { formatBytes } from "@/utils/format";

/**
 * The offline engine's model card: identity, download progress, memory
 * posture, and the actions. Owns every sheet it opens.
 *
 * The card renders with or without a selected model. An early return on
 * "no active model" once unmounted the whole thing - picker included - the
 * moment its model was deleted, stranding offline mode with no way back to
 * a model list. Deleting the last model is a legal state (the catalogue
 * re-seeds on the next launch), so the card's job here is the way back:
 * name the empty state and hand the reader to the picker.
 */
export function OfflineModelCard() {
  const [primary, mutedForeground, foreground, destructive] = useCSSVariable([
    "--color-primary",
    "--color-muted-foreground",
    "--color-foreground",
    "--color-destructive",
  ]);
  const models = useModelStore((s) => s.models);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const isLoaded = useModelStore((s) => s.isLoaded);
  const modelLoading = useModelStore((s) => s.isLoading);
  const loadError = useModelStore((s) => s.loadError);
  const downloadProgress = useModelStore((s) => s.downloadProgress);
  const cancelDownload = useModelStore((s) => s.cancelDownload);
  const downloadModel = useModelStore((s) => s.downloadModel);
  const releaseContext = useModelStore((s) => s.releaseContext);
  const memoryEstimate = useModelStore((s) => s.memoryEstimate);
  const checkMemory = useModelStore((s) => s.checkMemory);
  const inference = useModelStore((s) => s.inference);
  const activeModel = models.find((m) => m.id === activeModelId);

  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(
    null,
  );
  const [tuneVisible, setTuneVisible] = React.useState(false);
  const [memoryVisible, setMemoryVisible] = React.useState(false);
  const modelSheet = useModelSheet();

  // The power action's heartbeat: pulses only while the engine is loading.
  const powerPulseStyle = usePulse(modelLoading);

  // Run when the active model or context size changes — after the sheet is
  // up, never in the same pass as its first paint.
  React.useEffect(() => {
    if (activeModel?.isDownloaded && activeModel.id)
      checkMemory(activeModel.id);
  }, [
    activeModel?.id,
    activeModel?.isDownloaded,
    inference.contextSize,
    checkMemory,
  ]);

  const memoryStatus = memoryEstimate?.status ?? "fits";
  const downloading = activeModel
    ? downloadProgress[activeModel.id] !== undefined
    : false;
  const busy = modelLoading || isDeleting;

  return (
    <>
      <Card className="gap-3 p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>
              BRAIN
            </ThemedText>
            {activeModel ? (
              <>
                <ThemedText type="bodyMd" numberOfLines={2}>
                  {activeModel.name}
                </ThemedText>
                <ThemedText
                  type="labelSm"
                  color={asColor(mutedForeground)}
                  style={{ fontVariant: ["tabular-nums"] }}
                >
                  {activeModel.isDownloaded
                    ? `${formatBytes(activeModel.sizeBytes)} · Downloaded`
                    : `${formatBytes(activeModel.sizeBytes)} · Not downloaded`}
                </ThemedText>
              </>
            ) : (
              /* The empty state is a wayfinding moment, not an error: one
                 line saying what to do, and the picker one tap away. */
              <ThemedText type="bodyMd" numberOfLines={2}>
                No brain selected
              </ThemedText>
            )}
            {!activeModel && (
              <ThemedText
                type="bodySm"
                color={asColor(mutedForeground)}
                numberOfLines={2}
              >
                Pick a brain to run Samwell on this device.
              </ThemedText>
            )}
            {loadError && (
              <ThemedText
                type="labelSm"
                color={asColor(destructive)}
                numberOfLines={2}
              >
                {loadError}
              </ThemedText>
            )}
          </View>
          <ActionButton
            icon={List}
            label={activeModel ? "CHANGE" : "CHOOSE"}
            tint={asColor(mutedForeground)}
            onPress={modelSheet.open}
            accessibilityLabel={
              activeModel ? "Change the brain" : "Choose a brain"
            }
          />
        </View>

        {activeModel && downloadProgress[activeModel.id] !== undefined && (
          <View className="gap-1">
            {/* Square, like every other meter in the app. */}
            <View className="h-1 overflow-hidden bg-surface-tertiary">
              <View
                className="h-1 bg-primary"
                style={{
                  width: `${Math.round((downloadProgress[activeModel.id] ?? 0) * 100)}%`,
                }}
              />
            </View>
            <View className="flex-row items-center justify-between">
              <ThemedText
                type="labelSm"
                color={asColor(mutedForeground)}
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {Math.round((downloadProgress[activeModel.id] ?? 0) * 100)}%
              </ThemedText>
              <Touchable onPress={() => cancelDownload(activeModel.id)}>
                <ThemedText type="labelSm" color={asColor(destructive)}>
                  CANCEL
                </ThemedText>
              </Touchable>
            </View>
          </View>
        )}

        {activeModel?.isDownloaded && memoryStatus !== "fits" && (
          <ActionButton
            className="self-start"
            icon={MemoryStick}
            label={memoryStatus === "wont_fit" ? "TOO LARGE" : "TIGHT"}
            tint={
              memoryStatus === "wont_fit" ? asColor(destructive) : "#f97316"
            }
            // The one button here that warns rather than acts, so it keeps its
            // own tinted ground.
            style={{
              backgroundColor:
                memoryStatus === "wont_fit" ? "#e5393520" : "#f9731620",
            }}
            onPress={() => setMemoryVisible(true)}
          />
        )}

        {!downloading && activeModel && (
          <View className="flex-row flex-wrap gap-2">
            {!activeModel.isDownloaded && (
              <ActionButton
                icon={Download}
                label="DOWNLOAD"
                tint={asColor(primary)}
                disabled={isDownloading}
                onPress={async () => {
                  setIsDownloading(true);
                  try {
                    await downloadModel(activeModel.id);
                  } finally {
                    setIsDownloading(false);
                  }
                }}
              />
            )}
            {activeModel.isDownloaded && (
              <>
                <ActionButton
                  // The glyph pulses while the model loads, so it is composed
                  // here rather than named by the `icon` prop.
                  leading={
                    <Animated.View style={powerPulseStyle}>
                      <Power
                        size={14}
                        color={
                          modelLoading
                            ? asColor(primary)
                            : isLoaded
                              ? "#4caf50"
                              : asColor(mutedForeground)
                        }
                      />
                    </Animated.View>
                  }
                  label={isLoaded ? "SLEEP" : "WAKEN"}
                  tint={isLoaded ? undefined : asColor(mutedForeground)}
                  disabled={busy}
                  onPress={
                    isLoaded
                      ? releaseContext
                      : () => useModelStore.getState().initContext()
                  }
                />
                <ActionButton
                  icon={SlidersHorizontal}
                  label="TUNE"
                  tint={asColor(foreground)}
                  disabled={busy}
                  onPress={() => setTuneVisible(true)}
                />
              </>
            )}
            <ActionButton
              icon={Trash2}
              label="DELETE"
              tint={asColor(destructive)}
              disabled={busy}
              onPress={async () => {
                if (isLoaded) {
                  setIsDeleting(true);
                  try {
                    await releaseContext();
                  } finally {
                    setIsDeleting(false);
                  }
                }
                setConfirmDeleteId(activeModel.id);
              }}
            />
          </View>
        )}
      </Card>

      <ModelPickerSheet
        sheet={modelSheet}
        mutedForeground={asColor(mutedForeground)}
        primary={asColor(primary)}
        onDeleteRequest={setConfirmDeleteId}
      />
      {activeModel && (
        <TuneSheet
          visible={tuneVisible}
          onClose={() => setTuneVisible(false)}
          activeModel={activeModel}
        />
      )}
      <ConfirmDeleteSheet
        modelId={confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
      />
      <MemoryInfoSheet
        visible={memoryVisible}
        onClose={() => setMemoryVisible(false)}
        status={memoryStatus}
        estimate={memoryEstimate}
      />
    </>
  );
}
