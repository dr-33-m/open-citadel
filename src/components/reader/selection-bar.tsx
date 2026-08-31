import { Copy, Highlighter, MessageSquare } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { useCSSVariable } from "uniwind";

import { Separator } from "@/components/ui/separator";
import { Touchable } from "@/components/ui/touchable";

import { ThemedText } from "@/components/themed-text";

type SelectionBarProps = {
  onHighlight: () => void;
  onCopy: () => void;
  onChat: () => void;
  selectedText: string;
  chatLoading?: boolean;
};

/** ThemedText/lucide icons take a literal color, not a className — resolve the
 * semantic token once per render and fall back to `undefined` (which lets
 * `ThemedText` apply its own default) if it hasn't resolved yet. */
function asColor(value: string | number | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function SelectionBar({
  onHighlight,
  onCopy,
  onChat,
  selectedText,
  chatLoading = false,
}: SelectionBarProps) {
  const [primary, foreground, mutedForeground] = useCSSVariable([
    "--color-primary",
    "--color-foreground",
    "--color-muted-foreground",
  ]);
  // Core RN Animated, not Reanimated — this pulse loop predates the PanelUI
  // migration and is animation logic, not styling, so it's left exactly as
  // it was rather than ported as part of a styling-only pass.
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (chatLoading) {
      loopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.2, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      loopRef.current.start();
    } else {
      loopRef.current?.stop();
      pulseAnim.setValue(1);
    }
  }, [chatLoading]);

  return (
    <View className="flex-row items-stretch overflow-hidden border border-border bg-muted">
      <Touchable className="items-center justify-center gap-0.5 px-3 py-2" onPress={onHighlight}>
        <Highlighter size={14} color={asColor(primary)} />
        <ThemedText type="labelSm" color={asColor(primary)} style={{ fontSize: 10 }}>
          HIGHLIGHT
        </ThemedText>
      </Touchable>
      <Separator orientation="vertical" />
      <Touchable className="items-center justify-center gap-0.5 px-3 py-2" onPress={onCopy}>
        <Copy size={14} color={asColor(foreground)} />
        <ThemedText type="labelSm" color={asColor(mutedForeground)} style={{ fontSize: 10 }}>
          COPY
        </ThemedText>
      </Touchable>
      <Separator orientation="vertical" />
      <Touchable
        className="items-center justify-center gap-0.5 px-3 py-2"
        onPress={onChat}
        disabled={chatLoading}
      >
        <Animated.View style={{ opacity: pulseAnim }}>
          <MessageSquare size={14} color={chatLoading ? asColor(primary) : asColor(foreground)} />
        </Animated.View>
        <ThemedText
          type="labelSm"
          color={chatLoading ? asColor(primary) : asColor(mutedForeground)}
          style={{ fontSize: 10 }}
        >
          CHAT
        </ThemedText>
      </Touchable>
    </View>
  );
}
