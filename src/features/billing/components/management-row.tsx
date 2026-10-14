import React from "react";
import { View } from "react-native";
import { useCSSVariable } from "uniwind";

import { ChevronRight, type LucideIcon } from "@/components/icons";
import { ThemedText } from "@/components/themed-text";
import { Spinner } from "@/components/ui/spinner";
import { Touchable } from "@/components/ui/touchable";
import { asColor } from "@/utils/colors";

/** One thing that can be done about a plan: its mark, its name, and where it leads. */
export function ManagementRow({
  icon: Icon,
  label,
  detail,
  busy,
  disabled,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  detail: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const mutedForeground = useCSSVariable("--color-muted-foreground");

  return (
    <Touchable
      className="flex-row items-center gap-3 border-t border-border py-3"
      onPress={onPress}
      disabled={disabled}
      haptic="select"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={detail}
      accessibilityState={{ disabled, busy }}
    >
      <View className="h-9 w-9 items-center justify-center bg-muted">
        <Icon size={17} color={asColor(mutedForeground)} />
      </View>
      <View className="flex-1 gap-0.5">
        <ThemedText type="bodyMd">{label}</ThemedText>
        <ThemedText type="bodySm" color={asColor(mutedForeground)}>
          {detail}
        </ThemedText>
      </View>
      {busy ? (
        <Spinner size="sm" label={`${label} in progress`} />
      ) : (
        <ChevronRight size={17} color={asColor(mutedForeground)} />
      )}
    </Touchable>
  );
}
