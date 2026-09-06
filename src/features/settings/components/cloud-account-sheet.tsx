import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { SamwellText } from '@/components/samwell-text';
import { Sheet } from '@/components/ui/sheet';
import { ThemedText } from '@/components/themed-text';
import { asColor } from '@/utils/colors';

/**
 * What the account is, for the reader who taps "Optional" to find out.
 *
 * The question behind that tap is almost never "what does it unlock" — the
 * card above already says that. It is "what are you taking from me". So the
 * answer leads with what stays put, and only then says what the account is
 * actually for. Two short lines: anything longer reads as a policy, and a
 * policy is what people are afraid of here.
 */
export function CloudAccountSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const mutedForeground = useCSSVariable('--color-muted-foreground');

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View className="gap-4 px-6">
        <ThemedText type="headlineSm">Why an account?</ThemedText>

        <SamwellText type="bodyMd" color={asColor(mutedForeground)}>
          Your books, highlights, notes and conversations stay on this device. The account never
          holds them.
        </SamwellText>

        <SamwellText type="bodyMd" color={asColor(mutedForeground)}>
          It is for reaching the cloud models securely, and keeping your subscription active.
        </SamwellText>

        {/* Its own paragraph, and last. The way out matters most to the person
            who has just read the two above and decided the answer is no. */}
        <SamwellText type="bodyMd" color={asColor(mutedForeground)}>
          Alternatively you can use Samwell on your device without an account via offline mode.
        </SamwellText>
      </View>
    </Sheet>
  );
}
