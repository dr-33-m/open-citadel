import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';
import { asColor } from '@/utils/colors';

/** What is being removed, in a sentence: `lead`, then the thing's name set apart, then `rest`. */
export type RemovalCopy = {
  title: string;
  lead: string;
  subject: string;
  rest: string;
  /** The button: "DELETE", "REMOVE". */
  confirmLabel: string;
};

type ConfirmRemoveSheetProps = {
  visible: boolean;
  /** Null draws an empty sheet; keep the copy while it slides away. */
  copy: RemovalCopy | null;
  onClose: () => void;
  onConfirm: () => void;
};

/**
 * Asking before something is removed that cannot be brought back: what it is,
 * what goes with it, the one destructive button and the way out. One sheet
 * for deleting a book and removing a post's saved copy, so the two read alike.
 */
export function ConfirmRemoveSheet({ visible, copy, onClose, onConfirm }: ConfirmRemoveSheetProps) {
  const [mutedForeground, destructiveForeground] = useCSSVariable(['--color-muted-foreground', '--color-destructive-foreground']);

  // Not an early `return null`: the parent clears the subject in the same
  // commit that closes the sheet, and unmounting here takes the exit
  // animation with it.
  if (!copy) return <Sheet visible={visible} onClose={onClose}>{null}</Sheet>;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View className="gap-6 px-6">
        <ThemedText type="headlineSm">{copy.title}</ThemedText>

        <ThemedText type="bodySm" color={asColor(mutedForeground)}>
          {copy.lead} <ThemedText type="bodySm">{copy.subject}</ThemedText> {copy.rest}
        </ThemedText>

        <View className="gap-3">
          <Touchable className="items-center justify-center bg-destructive px-6 py-4" onPress={handleConfirm}>
            <ThemedText type="labelLg" color={asColor(destructiveForeground)}>
              {copy.confirmLabel}
            </ThemedText>
          </Touchable>

          <Touchable onPress={onClose} className="items-center py-3">
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>
              CANCEL
            </ThemedText>
          </Touchable>
        </View>
      </View>
    </Sheet>
  );
}
