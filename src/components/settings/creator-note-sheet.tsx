import { Linking, View } from "react-native";
import { useCSSVariable } from "uniwind";

import { PageFade } from "@/components/scroll-fades";
import { ThemedText } from "@/components/themed-text";
import { InstagramIcon, TikTokIcon } from "@/components/ui/brand-icons";
import { Sheet } from "@/components/ui/sheet";
import { Touchable } from "@/components/ui/touchable";
import { fontFamily, spacing } from "@/constants/theme";
import { asColor } from "@/utils/colors";

const NOTE_PARAGRAPHS = [
  "It genuinely means a lot to me.",
  "I built Open Citadel for people with a bias toward action. People who don't just want to learn, but want to do something with what they learn.",
  "Books have always been some of our greatest teachers and guides. Open Citadel is my attempt to help you turn their lessons into action, and keep track of the person you're becoming along the way.",
];

const SOCIALS = [
  {
    label: "TikTok",
    url: "https://www.tiktok.com/@_dr_33_m_",
    Icon: TikTokIcon,
  },
  {
    label: "Instagram",
    url: "https://www.instagram.com/_dr_33_m_",
    Icon: InstagramIcon,
  },
] as const;

export function CreatorNoteSheet({
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
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.78} scrollable>
      <PageFade edges="both" surface="popover">
        <Sheet.ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            gap: spacing[6],
            paddingHorizontal: spacing[6],
          }}
        >
          <View className="gap-3">
            <ThemedText type="labelSm" color={asColor(primary)}>
              A NOTE FROM THAMSANQA DREEM
            </ThemedText>
            <ThemedText type="headlineMd">
              Thank you for choosing Open Citadel.
            </ThemedText>
          </View>

          <View className="gap-4">
            {NOTE_PARAGRAPHS.map((paragraph) => (
              <ThemedText key={paragraph} type="bodyMd">
                {paragraph}
              </ThemedText>
            ))}
          </View>

          <View className="gap-2 border-l-2 border-primary pl-4">
            <ThemedText
              type="bodyLg"
              style={{ fontFamily: fontFamily.serifMedium }}
            >
              Keep learning. Keep doing. Keep becoming.
            </ThemedText>
            <ThemedText
              type="bodySm"
              color={asColor(mutedForeground)}
              style={{ fontFamily: fontFamily.serifItalic }}
            >
              Thamsanqa
            </ThemedText>
          </View>

          <View className="flex-row justify-center gap-3 border-t border-border pt-5">
            {SOCIALS.map(({ label, url, Icon }) => (
              <Touchable
                key={label}
                className="h-12 w-12 items-center justify-center border border-border"
                accessibilityRole="link"
                accessibilityLabel={`Open ${label}`}
                onPress={() => Linking.openURL(url)}
              >
                <Icon size={24} />
              </Touchable>
            ))}
          </View>
        </Sheet.ScrollView>
      </PageFade>
    </Sheet>
  );
}
