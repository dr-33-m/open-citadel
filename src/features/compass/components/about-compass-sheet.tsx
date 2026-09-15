import { View } from "react-native";
import { useCSSVariable } from "uniwind";

import { PageFade } from "@/components/scroll-fades";
import { ThemedText } from "@/components/themed-text";
import { Sheet } from "@/components/ui/sheet";
import { fontFamily, spacing } from "@/constants/theme";
import { asColor } from "@/utils/colors";

/**
 * `paddingBottom` so the closing line can scroll clear of the bottom fade
 * rather than coming to rest underneath it.
 */
const CONTENT_STYLE = {
  gap: spacing[6],
  paddingHorizontal: spacing[6],
  paddingBottom: spacing[6],
} as const;

const STEPS = [
  {
    number: "01",
    title: "Set a goal",
    body: "Tell Samwell what you want to change, in your own words. He helps you shape it into a goal made of small things you can actually do.",
  },
  {
    number: "02",
    title: "Log your days",
    body: "A few taps a day. Did you show up, and how did it go? That is all it asks.",
  },
  {
    number: "03",
    title: "Check in with Samwell",
    body: "Stuck or drifting? Talk it through. He can see what you have logged and what you wrote, so his advice is about your life, not someone else's.",
  },
  {
    number: "04",
    title: "See how far you have come",
    body: "The planner and insights show your consistency over time, and the person you are becoming.",
  },
] as const;

/**
 * What Compass is, for somebody standing at its door without the account or
 * plan to walk in. Written in the same voice as the creator note: a reader
 * asked to pay for something deserves to be told plainly what it is for.
 */
export function AboutCompassSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [primary, mutedForeground] = useCSSVariable([
    "--color-primary",
    "--color-muted-foreground",
  ]);

  return (
    /* A fixed height, not `maxHeightRatio` + `scrollable`. Sized to its
        content, the sheet capped its own height on a short screen but the
        scroll region inside stayed as tall as the text, so it ran past the
        bottom of the sheet with nothing to scroll: the last steps and the
        closing line were simply cut off. A fixed height gives the scroll
        region a real box to fit, the same as the contents sheet. The text is
        long enough to fill most of this on any phone, so there is little
        empty space to lose on a tall one. */
    <Sheet visible={visible} onClose={onClose} fixedHeightRatio={0.85}>
      <PageFade edges="both" surface="popover">
        <Sheet.ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={CONTENT_STYLE}
        >
          <View className="gap-3">
            <ThemedText type="labelSm" color={asColor(primary)}>
              ABOUT COMPASS
            </ThemedText>
            <ThemedText type="headlineMd">
              A book only changes you when you act on it.
            </ThemedText>
          </View>

          <View className="gap-4">
            <ThemedText type="bodyMd">
              You finish a book full of good ideas. A week later, most of them
              have slipped away. Nothing happened after the last page.
            </ThemedText>
            <ThemedText type="bodyMd">
              Compass is where something happens next.
            </ThemedText>
          </View>

          <View className="gap-5">
            {STEPS.map((step) => (
              <View key={step.number} className="flex-row gap-4">
                <ThemedText type="labelSm" color={asColor(primary)}>
                  {step.number}
                </ThemedText>
                <View className="flex-1 gap-1">
                  <ThemedText
                    type="bodyLg"
                    style={{ fontFamily: fontFamily.serifMedium }}
                  >
                    {step.title}
                  </ThemedText>
                  <ThemedText type="bodySm" color={asColor(mutedForeground)}>
                    {step.body}
                  </ThemedText>
                </View>
              </View>
            ))}
          </View>

          <View className="gap-2 border-l-2 border-primary pl-4">
            <ThemedText
              type="bodyLg"
              style={{ fontFamily: fontFamily.serifMedium }}
            >
              Small steps, taken daily, become who you are.
            </ThemedText>
            <ThemedText
              type="bodySm"
              color={asColor(mutedForeground)}
              style={{ fontFamily: fontFamily.serifItalic }}
            >
              Compass is part of Samwell Cloud.
            </ThemedText>
          </View>
        </Sheet.ScrollView>
      </PageFade>
    </Sheet>
  );
}
