import { View } from "react-native";
import { useCSSVariable } from "uniwind";

import { Info } from "@/components/icons";
import { ThemedText } from "@/components/themed-text";
import { Alert } from "@/components/ui/alert";
import { Sheet } from "@/components/ui/sheet";

export type EngineMode = "offline" | "cloud";

type EngineInfo = {
  label: string;
  persona: string;
  points: string[];
  /** A caution drawn after the points, for what this mode is not good at. */
  notice?: { title: string; body: string };
};

const CONTENT: Record<EngineMode, EngineInfo> = {
  offline: {
    label: "OFFLINE",
    persona: "Samwell on your device.",
    points: [
      "He runs entirely on your device. Nothing you say leaves your phone.",
      "Works anywhere, with no internet.",
      "No usage limits, and free.",
      "He is bound by your phone, so he uses a smaller brain than the cloud.",
      "Compass is not available offline.",
    ],
    notice: {
      title: "Best for chat",
      body: "On-device brains are good at conversation, but may struggle to do things for you in Open Citadel. To use everything it offers, switch to Samwell Cloud.",
    },
  },
  cloud: {
    label: "CLOUD",
    persona: "Samwell in the cloud.",
    points: [
      "In the Cloud, Samwell has three expert levels to choose from: Maester, Grand Maester and Archmaester.",
      "Deeper thinking and sharper insight than any phone can manage.",
      "Compass only available here, with Samwell cloud.",
      "Needs an internet connection. Only what each request needs is sent, nothing more.",
    ],
  },
};

export function EngineInfoSheet({
  mode,
  onClose,
}: {
  mode: EngineMode | null;
  onClose: () => void;
}) {
  // ThemedText's `color` prop takes a literal, never a className.
  const primary = useCSSVariable("--color-primary");
  const mutedForeground = useCSSVariable("--color-muted-foreground");
  const labelColor = typeof primary === "string" ? primary : undefined;
  const pointColor =
    typeof mutedForeground === "string" ? mutedForeground : undefined;

  const info = mode ? CONTENT[mode] : null;

  return (
    <Sheet visible={mode !== null} onClose={onClose}>
      {info && (
        <View className="gap-6 px-6">
          <View className="gap-1">
            <ThemedText type="labelSm" color={labelColor}>
              {info.label}
            </ThemedText>
            <ThemedText type="headlineSm">{info.persona}</ThemedText>
          </View>
          <View className="gap-3">
            {info.points.map((point) => (
              <View key={point} className="flex-row gap-3">
                <View className="h-1 w-1 bg-primary" style={{ marginTop: 8 }} />
                <ThemedText type="bodySm" color={pointColor} className="flex-1">
                  {point}
                </ThemedText>
              </View>
            ))}
          </View>
          {info.notice && (
            // The same quiet card as the catalogue's note: no status colour,
            // since nothing is wrong, and square like the rest of the app.
            // Not folded, unlike that one: this sheet exists to be read.
            <Alert className="rounded-none">
              <Alert.Indicator>
                <Info size={16} color={pointColor} strokeWidth={2} />
              </Alert.Indicator>
              <Alert.Content>
                <Alert.Title>{info.notice.title}</Alert.Title>
                <Alert.Description>{info.notice.body}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}
        </View>
      )}
    </Sheet>
  );
}
