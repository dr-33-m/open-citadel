import { Info } from "@/components/icons";
import { View } from "react-native";
import { useCSSVariable } from "uniwind";

import { ThemedText } from "@/components/themed-text";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Touchable } from "@/components/ui/touchable";
import { spacing } from "@/constants/theme";
import { cn } from "@/lib/cn";
import { DEVICE_CATALOGUE } from "@/services/device-llm/catalogue";
import { useModelStore } from "@/stores/model";
import { asColor } from "@/utils/colors";

/** The brains whose tool calls can be read, named for the reader whose brain cannot. */
const TOOL_BRAINS = DEVICE_CATALOGUE.filter((m) => m.toolFormat)
  .map((m) => m.name)
  .join(", ");

/**
 * The switches the active brain supports: tools, and thinking where the brain
 * can reason (Qwen 3 and Gemma 4, each by its own switch). Applies from the
 * next message.
 *
 * There is no backend or context window to choose any more: under ExecuTorch
 * both are fixed when a brain is exported, so they come with the brain.
 */
export function TuneSheet({
  visible,
  onClose,
  activeModel,
}: {
  visible: boolean;
  onClose: () => void;
  activeModel: { supportsToolCalling: boolean; supportsThinking: boolean };
}) {
  const [mutedForeground, primary] = useCSSVariable([
    "--color-muted-foreground",
    "--color-primary",
  ]);
  const inference = useModelStore((s) => s.inference);
  const setInference = useModelStore((s) => s.setInference);
  const isLoaded = useModelStore((s) => s.isLoaded);
  const showApplyNote =
    isLoaded && (activeModel.supportsToolCalling || activeModel.supportsThinking);

  return (
    // `maxHeightRatio` is the cap and the only cap — the sheet measures this
    // content and stops there, so the scroll region needs no `maxHeight` of
    // its own.
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.85} scrollable>
      <Sheet.ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing[6],
          gap: spacing[6],
        }}
      >
        <ThemedText type="bodySm" color={asColor(mutedForeground)}>
          CAPABILITIES
        </ThemedText>

        {activeModel.supportsToolCalling ? (
          <ToggleRow
            title="Tool Calling"
            note="Search highlights, tag items, and more."
            value={inference.enableToolCalling}
            onValueChange={(val) => setInference({ enableToolCalling: val })}
          />
        ) : (
          <ThemedText type="bodySm" color={asColor(mutedForeground)}>
            This brain talks but cannot use Samwell&apos;s tools. {TOOL_BRAINS} can.
          </ThemedText>
        )}

        {activeModel.supportsThinking ? (
          <ToggleRow
            title="Thinking"
            note="He thinks before he answers. Slower, and on smaller brains it leaves him less room to answer in."
            value={inference.enableThinking}
            onValueChange={(val) => setInference({ enableThinking: val })}
          />
        ) : null}

        {showApplyNote ? (
          <View className="flex-row items-center gap-1">
            <Info size={12} color={asColor(primary)} />
            <ThemedText
              type="bodySm"
              color={asColor(primary)}
              style={{ fontSize: 11 }}
            >
              Changes apply from your next message.
            </ThemedText>
          </View>
        ) : null}
      </Sheet.ScrollView>
    </Sheet>
  );
}

function ToggleRow({
  title,
  note,
  value,
  disabled = false,
  onValueChange,
}: {
  title: string;
  note: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const [mutedForeground] = useCSSVariable(["--color-muted-foreground"]);
  const toggle = () => {
    if (!disabled) onValueChange(!value);
  };
  return (
    <Touchable
      className={cn("flex-row items-center justify-between", disabled && "opacity-40")}
      disabled={disabled}
      onPress={toggle}
    >
      <View className="flex-1 gap-1">
        <ThemedText type="bodySm">{title}</ThemedText>
        <ThemedText
          type="bodySm"
          color={asColor(mutedForeground)}
          style={{ fontSize: 11 }}
        >
          {note}
        </ThemedText>
      </View>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} />
    </Touchable>
  );
}
