import { View } from "react-native";
import { useCSSVariable } from "uniwind";

import { ThemedText } from "@/components/themed-text";
import { Sheet } from "@/components/ui/sheet";
import { Touchable } from "@/components/ui/touchable";
import { useModelStore } from "@/stores/model";
import { asColor } from "@/utils/colors";

/**
 * The destructive confirm for a model. Files and list entries get different
 * copy — deleting a downloaded file is worth naming as such.
 */
export function ConfirmDeleteSheet({
  modelId,
  onClose,
}: {
  modelId: string | null;
  onClose: () => void;
}) {
  const [mutedForeground, destructive, destructiveForeground] = useCSSVariable([
    "--color-muted-foreground",
    "--color-destructive",
    "--color-destructive-foreground",
  ]);
  const models = useModelStore((s) => s.models);
  const deleteModel = useModelStore((s) => s.deleteModel);
  const model = models.find((m) => m.id === modelId);

  return (
    <Sheet visible={modelId !== null} onClose={onClose}>
      <View className="gap-6 px-6">
        <ThemedText type="headlineSm">
          {model?.isDownloaded ? "Delete brain file?" : "Remove brain?"}
        </ThemedText>
        <ThemedText type="bodySm" color={asColor(mutedForeground)}>
          {model?.isDownloaded
            ? "The brain will be removed from your device. You can re-download it later."
            : "The brain will be removed from your list. You can add it again later."}
        </ThemedText>
        <View className="flex-row gap-3">
          <Touchable
            className="flex-row items-center gap-2 bg-muted px-3 py-2"
            onPress={onClose}
          >
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>
              CANCEL
            </ThemedText>
          </Touchable>
          <Touchable
            className="flex-row items-center gap-2 bg-destructive px-3 py-2"
            onPress={() => {
              if (modelId) deleteModel(modelId);
              onClose();
            }}
          >
            <ThemedText type="labelSm" color={asColor(destructiveForeground)}>
              DELETE
            </ThemedText>
          </Touchable>
        </View>
      </View>
    </Sheet>
  );
}
