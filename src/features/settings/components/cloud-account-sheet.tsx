import { View } from "react-native";
import { useCSSVariable } from "uniwind";

import { SamwellText } from "@/components/samwell-text";
import { ThemedText } from "@/components/themed-text";
import { Sheet } from "@/components/ui/sheet";
import { asColor } from "@/utils/colors";

/**
 * What the account is, for the reader who taps "Optional" to find out.
 *
 * The question behind that tap is almost never "what does it unlock" — the
 * card above already says that. It is "what are you taking from me". So the
 * answer leads with what stays put, and only then says what the account is
 * actually for.
 *
 * Which is no longer reaching the cloud: a plan can be bought on this device
 * without one (App Review 5.1.1(v)). What an account adds is a home for that
 * plan beyond this phone, so that is all it claims.
 */
export function CloudAccountSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const mutedForeground = useCSSVariable("--color-muted-foreground");

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View className="gap-4 px-6">
        <ThemedText type="headlineSm">Why an account?</ThemedText>

        <SamwellText type="bodyMd" color={asColor(mutedForeground)}>
          Your books, highlights, notes and conversations stay on this device.
          The account never holds them.
        </SamwellText>

        <SamwellText type="bodyMd" color={asColor(mutedForeground)}>
          You can buy a plan without one. An account puts your plan in your
          name, so it works on any device you sign in on.
        </SamwellText>

        {/* Its own paragraph, and last. The way out matters most to the person
            who has just read the two above and decided the answer is no. */}
        <SamwellText type="bodyMd" color={asColor(mutedForeground)}>
          Without an account, Samwell still works on this device, offline or
          with a plan bought here.
        </SamwellText>
      </View>
    </Sheet>
  );
}
