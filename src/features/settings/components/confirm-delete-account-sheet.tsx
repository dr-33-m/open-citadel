import { View } from "react-native";
import { useCSSVariable } from "uniwind";

import { ThemedText } from "@/components/themed-text";
import { Sheet } from "@/components/ui/sheet";
import { Touchable } from "@/components/ui/touchable";
import { asColor } from "@/utils/colors";

/**
 * The confirm for deleting an account, and the last chance to read what that
 * means.
 *
 * Three things worth saying, and all three are said. What goes: the account,
 * the sign-in, and everything Samwell Cloud kept against it. What stays: the
 * library, which is on this phone and was never part of the account. And the
 * subscription, which is Apple's or Google's to cancel and carries on billing
 * if nobody does - the one consequence a reader cannot undo from in here.
 */
export function ConfirmDeleteAccountSheet({
  visible,
  hasSubscription,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  /** Adds the line about cancelling, for somebody who is paying. */
  hasSubscription: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [mutedForeground, destructiveForeground] = useCSSVariable([
    "--color-muted-foreground",
    "--color-destructive-foreground",
  ]);

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View className="gap-5 px-6">
        <ThemedText type="headlineSm">Delete your account?</ThemedText>
        <ThemedText type="bodySm" color={asColor(mutedForeground)}>
          Your account, your credits and everything Samwell Cloud kept about
          your turns will be deleted for good. This cannot be undone.
        </ThemedText>
        <ThemedText type="bodySm" color={asColor(mutedForeground)}>
          Your books, highlights, notes and goals stay on this device. Samwell
          still works offline.
        </ThemedText>
        {hasSubscription ? (
          <ThemedText type="bodySm" color={asColor(mutedForeground)}>
            Deleting your account does not cancel your subscription. Cancel it
            in your store subscription settings, or it keeps renewing.
          </ThemedText>
        ) : null}
        <View className="flex-row gap-3">
          <Touchable
            className="flex-row items-center gap-2 bg-muted px-3 py-2"
            onPress={onClose}
          >
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>
              CANCEL
            </ThemedText>
          </Touchable>
          <Touchable
            className="flex-row items-center gap-2 bg-destructive px-3 py-2"
            onPress={() => {
              onConfirm();
              onClose();
            }}
          >
            <ThemedText
              type="labelSm"
              color={asColor(destructiveForeground)}
            >
              DELETE ACCOUNT
            </ThemedText>
          </Touchable>
        </View>
      </View>
    </Sheet>
  );
}
