import { Linking, View } from "react-native";
import { useCSSVariable } from "uniwind";

import { FitSheet } from "@/components/fit-sheet";
import { ThemedText } from "@/components/themed-text";
import { DiscordIcon, InstagramIcon, TikTokIcon } from "@/components/ui/brand-icons";
import { GoldButton } from "@/components/ui/gold-button";
import { Touchable } from "@/components/ui/touchable";
import { fontFamily, spacing } from "@/constants/theme";
import { asColor } from "@/utils/colors";

/** The community's invite. Made to never expire: the app carries it for as long as a copy is installed. */
const DISCORD_INVITE = "https://discord.gg/Eezupe4GAW";

const THANKS =
  "I built Open Citadel for people who read to do something with what they learn. That you chose it means a lot to me.";

const INVITATION =
  "I'm building a community for people who read with purpose. Share your journey, learn from others on the same road, and help shape what Open Citadel becomes.";

const SOCIALS = [
  { label: "TikTok", url: "https://www.tiktok.com/@_dr_33_m_", Icon: TikTokIcon },
  { label: "Instagram", url: "https://www.instagram.com/_dr_33_m_", Icon: InstagramIcon },
] as const;

const BODY = { paddingHorizontal: spacing[6], paddingTop: spacing[6], gap: spacing[6] } as const;

/**
 * A note from the author: thanks, kept short, and then the one thing worth
 * doing next, joining the community on Discord. The invitation is the
 * sheet's one gold commit, pinned where the thumb is; the author's other
 * places sit under it, quiet. The button draws Discord's mark in its label
 * colour, which Discord's guidelines allow (blurple, black or white).
 */
export function CreatorNoteSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [primary, mutedForeground] = useCSSVariable(["--color-primary", "--color-muted-foreground"]);
  const muted = asColor(mutedForeground);

  const header = (
    <View className="gap-3 px-6">
      <ThemedText type="labelSm" color={asColor(primary)}>
        A NOTE FROM THAMSANQA DREEM
      </ThemedText>
      <ThemedText type="headlineMd">Thank you for being here.</ThemedText>
    </View>
  );

  const footer = (
    <View className="gap-5 px-6 pt-6">
      <GoldButton label="JOIN THE DISCORD" icon={DiscordIcon} onPress={() => Linking.openURL(DISCORD_INVITE)} />
      <View className="flex-row justify-center gap-3">
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
    </View>
  );

  return (
    <FitSheet visible={visible} onClose={onClose} header={header} footer={footer} contentStyle={BODY} heightRatio={0.9}>
      <ThemedText type="bodyMd">{THANKS}</ThemedText>

      <View className="gap-2 border-l-2 border-primary pl-4">
        <ThemedText type="bodyLg" style={{ fontFamily: fontFamily.serifMedium }}>
          Keep learning. Keep doing. Keep becoming.
        </ThemedText>
        <ThemedText type="bodySm" color={muted} style={{ fontFamily: fontFamily.serifItalic }}>
          Thamsanqa
        </ThemedText>
      </View>

      <View className="gap-2 border-t border-border pt-6">
        <ThemedText type="headlineSm">Grow together on Discord</ThemedText>
        <ThemedText type="bodyMd" color={muted}>
          {INVITATION}
        </ThemedText>
      </View>
    </FitSheet>
  );
}
