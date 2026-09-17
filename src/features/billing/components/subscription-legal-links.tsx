import { Linking, View } from "react-native";
import { useCSSVariable } from "uniwind";

import { ThemedText } from "@/components/themed-text";
import { Touchable } from "@/components/ui/touchable";
import { asColor } from "@/utils/colors";

/**
 * Apple's standard EULA. App Review wants a working Terms of Use link on every
 * screen that sells an auto-renewing subscription (guideline 3.1.2), and the
 * same link in the App Store description.
 */
const TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
const PRIVACY_URL = "https://www.open-citadel.online/privacy";

const LINKS = [
  { label: "TERMS OF USE", url: TERMS_URL },
  { label: "PRIVACY POLICY", url: PRIVACY_URL },
] as const;

/** The Terms of Use and Privacy Policy row under a plan picker. */
export function SubscriptionLegalLinks() {
  const mutedForeground = useCSSVariable("--color-muted-foreground");
  const color = asColor(mutedForeground);

  return (
    <View className="flex-row items-center justify-center">
      {LINKS.map(({ label, url }) => (
        <Touchable
          key={url}
          className="px-3 py-2"
          onPress={() => void Linking.openURL(url).catch(() => undefined)}
          haptic="select"
          accessibilityRole="link"
          accessibilityLabel={label.toLowerCase()}
        >
          <ThemedText type="labelSm" color={color} className="tracking-[1px]">
            {label}
          </ThemedText>
        </Touchable>
      ))}
    </View>
  );
}
