import { Copy, Highlighter, MessageSquare } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { spacing } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";

type SelectionBarProps = {
  onHighlight: () => void;
  onCopy: () => void;
  onChat: () => void;
  selectedText: string;
  chatLoading?: boolean;
};

export function SelectionBar({
  onHighlight,
  onCopy,
  onChat,
  selectedText,
  chatLoading = false,
}: SelectionBarProps) {
  const colors = useColors();
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
      <View style={styles.divider} />
      <Pressable style={styles.btn} onPress={onChat} disabled={chatLoading}>
        <Animated.View style={{ opacity: pulseAnim }}>
          <MessageSquare
            size={14}
            color={chatLoading ? colors.primary.default : colors.text.primary}
          />
        </Animated.View>
        <ThemedText
          type="labelSm"
          color={chatLoading ? colors.primary.default : colors.text.secondary}
          style={styles.label}
        >
          CHAT
        </ThemedText>
      </Pressable>
    </View>
  );
}
