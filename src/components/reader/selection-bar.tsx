import { Copy, Highlighter } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { spacing } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";

type SelectionBarProps = {
  onHighlight: () => void;
  onCopy: () => void;
  selectedText: string;
};

export function SelectionBar({
  onHighlight,
  onCopy,
  selectedText,
}: SelectionBarProps) {
  const colors = useColors();

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        container: {
          flexDirection: "row",
          backgroundColor: colors.surface.mid,
          borderWidth: 1,
          borderColor: colors.surface.highest,
          overflow: "hidden",
        },
        btn: {
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: spacing[2],
          paddingHorizontal: spacing[3],
          gap: 2,
        },
        label: {
          fontSize: 10,
        },
        divider: {
          width: 1,
          backgroundColor: colors.surface.highest,
        },
      }),
    [colors],
  );

  return (
    <View style={styles.container}>
      <Pressable style={styles.btn} onPress={onHighlight}>
        <Highlighter size={14} color={colors.primary.default} />
        <ThemedText
          type="labelSm"
          color={colors.primary.default}
          style={styles.label}
        >
          HIGHLIGHT
        </ThemedText>
      </Pressable>
      <View style={styles.divider} />
      <Pressable style={styles.btn} onPress={onCopy}>
        <Copy size={14} color={colors.text.primary} />
        <ThemedText
          type="labelSm"
          color={colors.text.secondary}
          style={styles.label}
        >
          COPY
        </ThemedText>
      </Pressable>
    </View>
  );
}
