import React from "react";
import { View } from "react-native";
import { useCSSVariable } from "uniwind";

import { ThemedText } from "@/components/themed-text";
import {
    PlanCarousel,
    type PlanCarouselProps,
} from "@/features/billing/components/plan-carousel";
import { asColor } from "@/utils/colors";

/**
 * The plan carousel under its heading, which is how the cloud panel sells a
 * plan in both of the states that sell one: nobody signed in, and signed in
 * without a plan.
 *
 * One component rather than two copies of the same six lines, because the
 * heading and the run are a unit - the subtitle is the only thing that
 * differs, and it differs because the two states have different things worth
 * saying. Two copies would have been two places to fix the day the carousel
 * gains a prop.
 */
export function PlanPicker({
  subtitle,
  ...carousel
}: {
  /** The line under "Choose a plan". The reason it is on screen. */
  subtitle: string;
} & Pick<
  PlanCarouselProps,
  | "packages"
  | "catalogue"
  | "modelCounts"
  | "busy"
  | "loading"
  | "onChoose"
  | "onRestore"
  | "surface"
  | "bleed"
>) {
  const mutedForeground = useCSSVariable("--color-muted-foreground");

  return (
    <View className="gap-4">
      <View className="gap-1">
        <ThemedText type="bodyMd">Choose a plan</ThemedText>
        <ThemedText type="bodySm" color={asColor(mutedForeground)}>
          {subtitle}
        </ThemedText>
      </View>
      <PlanCarousel {...carousel} />
    </View>
  );
}
