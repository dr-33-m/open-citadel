import { View } from "react-native";
import { useCSSVariable } from "uniwind";

import { ThemedText } from "@/components/themed-text";
import { Sheet } from "@/components/ui/sheet";
import { Touchable } from "@/components/ui/touchable";
import { useModelStore } from "@/stores/model";
import { asColor } from "@/utils/colors";

/**
 * The destructive confirm for a brain's download. The brain stays in the list,
 * ready to download again, and the copy says so.
 */
export function ConfirmDeleteSheet({
  modelId,
  onClose,
}: {
  modelId: string | null;
  onClose: () => void;
}) {
  const [mutedForeground, destructiveForeground] = useCSSVariable([
    "--color-muted-foreground",
    "--color-destructive-foreground",
  ]);
  const models = useModelStore((s) => s.models);
  const deleteModel = useModelStore((s) => s.deleteModel);
  const model = models.find((m) => m.id === modelId);
  const body = `${model?.name ?? "The brain"} will be removed from your device. You can download it again later.`;

  return (
    <Sheet visible={modelId !== null} onClose={onClose}>
      <View className="gap-6 px-6">
        <ThemedText type="headlineSm">Delete brain file?</ThemedText>
        <ThemedText type="bodySm" color={asColor(mutedForeground)}>
          {body}
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
