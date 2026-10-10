import React from "react";
import { View, type TextStyle } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useThemeTokens } from "@/hooks/use-theme-tokens";

const TABULAR: TextStyle = { fontVariant: ["tabular-nums"] };

export interface PlanReadingVoicesProps {
  /** The voice makers the plan reaches, in catalogue order. */
  makers: string[];
  /** Hours a month the plan's default voice reads for, or null when unpriced. */
  hours: number | null;
}

/**
 * What the plan reads aloud with, in the info sheet: the makers it opens and
 * how long its default voice lasts. The default is the voice that lasts, so
 * the figure is the plan's honest best, and a dearer voice reads for less.
 */
export function PlanReadingVoices({ makers, hours }: PlanReadingVoicesProps) {
  const muted = useThemeTokens()["--color-muted-foreground"];
  if (makers.length === 0) return null;
  return (
    <View className="gap-2">
      <ThemedText type="headlineSm">Reading voices</ThemedText>
      {hours != null ? (
        <View className="flex-row items-baseline gap-2">
          <ThemedText type="headlineMd" style={TABULAR}>
            ≈ {hours >= 10 ? Math.round(hours) : hours}
          </ThemedText>
          <ThemedText type="bodySm" color={muted}>
            hours of cloud reading / month
          </ThemedText>
        </View>
      ) : null}
      {makers.map((maker) => (
        <View key={maker} className="border-b border-surface-tertiary py-3">
          <ThemedText type="bodyMd">{maker}</ThemedText>
        </View>
      ))}
      <ThemedText type="bodySm" color={muted} className="pt-1">
        On-device voices stay free. Neurons pay for the voice, never the book.
      </ThemedText>
    </View>
  );
}
