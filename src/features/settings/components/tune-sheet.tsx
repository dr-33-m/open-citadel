import { Info } from "@/components/icons";
import { View } from "react-native";
import { useCSSVariable } from "uniwind";

import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Touchable } from "@/components/ui/touchable";
import { spacing } from "@/constants/theme";
import { cn } from "@/lib/cn";
import { useModelStore } from "@/stores/model";
import { asColor } from "@/utils/colors";

type ModelCapabilities = {
  supportsSpeculativeDecoding?: boolean;
  supportsToolCalling?: boolean;
  supportsThinking?: boolean;
};

/**
 * Inference tuning: backend, context window, and the capability switches
 * the active model supports. Applies live; waking Samwell commits it.
 */
export function TuneSheet({
  visible,
  onClose,
  activeModel,
}: {
  visible: boolean;
  onClose: () => void;
  activeModel: ModelCapabilities;
}) {
  const [mutedForeground, primary, primaryForeground] = useCSSVariable([
    "--color-muted-foreground",
    "--color-primary",
    "--color-primary-foreground",
  ]);
  const inference = useModelStore((s) => s.inference);
  const setInference = useModelStore((s) => s.setInference);
  const activeBackend = useModelStore((s) => s.activeBackend);
  const unavailableBackends = useModelStore((s) => s.unavailableBackends);
  const isLoaded = useModelStore((s) => s.isLoaded);

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
          PERFORMANCE
        </ThemedText>

        <View className="gap-1">
          <View className="flex-row items-center gap-2">
            <ThemedText type="bodySm">Backend</ThemedText>
            {activeBackend && (
              <ThemedText
                type="bodySm"
                color="#4caf50"
                style={{ fontSize: 11 }}
              >
                Running on {activeBackend.toUpperCase()}
              </ThemedText>
            )}
          </View>
          <View className="flex-row flex-wrap gap-2">
            {(["cpu", "gpu", "npu"] as const).map((backend) => {
              const active = inference.backend === backend;
              const disabled = unavailableBackends.has(backend);
              return (
                <Touchable
                  key={backend}
                  style={disabled ? { opacity: 0.35 } : undefined}
                  onPress={() => {
                    if (!disabled) setInference({ backend });
                  }}
                >
                  <Card
                    className={cn(
                      "px-4 py-2",
                      active && "border-primary bg-primary",
                    )}
                  >
                    <ThemedText
                      type="labelSm"
                      color={active ? asColor(primaryForeground) : undefined}
                    >
                      {backend.toUpperCase()}
                    </ThemedText>
                  </Card>
                </Touchable>
              );
            })}
          </View>
          <ThemedText
            type="bodySm"
            color={asColor(mutedForeground)}
            style={{ fontSize: 11 }}
          >
            {unavailableBackends.size > 0
              ? `${[...unavailableBackends].map((b) => b.toUpperCase()).join(" & ")} not supported on this device.`
              : "GPU is fastest. NPU requires supported hardware. Falls back to CPU if unavailable."}
          </ThemedText>
        </View>

        <View className="gap-1">
          <ThemedText type="bodySm">Context Window</ThemedText>
          <View className="flex-row flex-wrap gap-2">
            {[2048, 4096].map((size) => {
              const active = inference.contextSize === size;
              return (
                <Touchable
                  key={size}
                  onPress={() => setInference({ contextSize: size })}
                >
                  <Card
                    className={cn(
                      "px-4 py-2",
                      active && "border-primary bg-primary",
                    )}
                  >
                    <ThemedText
                      type="labelSm"
                      color={active ? asColor(primaryForeground) : undefined}
                    >
                      {`${size / 1024}K`}
                    </ThemedText>
                  </Card>
                </Touchable>
              );
            })}
          </View>
          <ThemedText
            type="bodySm"
            color={asColor(mutedForeground)}
            style={{ fontSize: 11 }}
          >
            Lower = faster & less RAM. Raise for longer conversations.
          </ThemedText>
        </View>

        {activeModel?.supportsSpeculativeDecoding && (
          <ToggleRow
            title="Multi-Token Prediction"
            note="Faster generation on supported brains."
            value={inference.enableSpeculativeDecoding}
            onValueChange={(val) =>
              setInference({ enableSpeculativeDecoding: val })
            }
          />
        )}

        {(activeModel?.supportsToolCalling ||
          activeModel?.supportsThinking) && (
          <ThemedText type="bodySm" color={asColor(mutedForeground)}>
            CAPABILITIES
          </ThemedText>
        )}

        {activeModel?.supportsToolCalling && (
          <ToggleRow
            title="Tool Calling"
            note="Search highlights, tag items, and more."
            value={inference.enableToolCalling}
            // Tools and thinking are mutually exclusive: turning one on
            // turns the other off.
            onValueChange={(val) =>
              setInference(
                val
                  ? { enableToolCalling: true, enableThinking: false }
                  : { enableToolCalling: false },
              )
            }
          />
        )}

        {activeModel?.supportsThinking && (
          <ToggleRow
            title="Thinking Mode"
            note="Show reasoning before answering. Disables tools."
            value={inference.enableThinking}
            onValueChange={(val) =>
              setInference(
                val
                  ? { enableThinking: true, enableToolCalling: false }
                  : { enableThinking: false },
              )
            }
          />
        )}

        {isLoaded && (
          <View className="flex-row items-center gap-1">
            <Info size={12} color={asColor(primary)} />
            <ThemedText
              type="bodySm"
              color={asColor(primary)}
              style={{ fontSize: 11 }}
            >
              Power down and wake up Samwell to apply changes.
            </ThemedText>
          </View>
        )}
      </Sheet.ScrollView>
    </Sheet>
  );
}

function ToggleRow({
  title,
  note,
  value,
  onValueChange,
}: {
  title: string;
  note: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const [mutedForeground] = useCSSVariable(["--color-muted-foreground"]);
  return (
    <Touchable
      className="flex-row items-center justify-between"
      onPress={() => onValueChange(!value)}
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
      <Switch value={value} onValueChange={onValueChange} />
    </Touchable>
  );
}
