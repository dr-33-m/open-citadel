import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Sheet } from '@/components/ui/sheet';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { asColor } from '@/utils/colors';

/**
 * The confirm for signing out.
 *
 * Worth asking about even though nothing is deleted, because from the inside
 * it does not look that way: an account is the sort of thing people expect to
 * be holding their books. Saying plainly that it is not is most of the point
 * of this sheet.
 */
export function ConfirmSignOutSheet({
  visible,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [mutedForeground, destructiveForeground] = useCSSVariable([
    '--color-muted-foreground',
    '--color-destructive-foreground',
  ]);

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View className="gap-6 px-6">
        <ThemedText type="headlineSm">Sign out?</ThemedText>
        <ThemedText type="bodySm" color={asColor(mutedForeground)}>
          Your books, highlights and notes stay on this device. You can sign back in any time.
        </ThemedText>
        <View className="flex-row gap-3">
          <Touchable className="flex-row items-center gap-2 bg-muted px-3 py-2" onPress={onClose}>
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>CANCEL</ThemedText>
          </Touchable>
          <Touchable
            className="flex-row items-center gap-2 bg-destructive px-3 py-2"
            onPress={() => {
              onConfirm();
              onClose();
            }}
          >
            <ThemedText type="labelSm" color={asColor(destructiveForeground)}>SIGN OUT</ThemedText>
          </Touchable>
        </View>
      </View>
    </Sheet>
  );
}
