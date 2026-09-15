import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';

/**
 * The brain picker's title row.
 *
 * Sits above each phase's list rather than inside it, so the title and the way
 * back stay where they are while the rows scroll underneath.
 */
export function ModelPickerHeader({
  title,
  onBack,
  primary,
}: {
  title: string;
  /** Present on the phases that have somewhere to go back to. */
  onBack?: () => void;
  primary?: string;
}) {
  if (!onBack) {
    return (
      <View className="px-6 pb-3">
        <ThemedText type="headlineSm">{title}</ThemedText>
      </View>
    );
  }

  return (
    <Touchable className="flex-row items-center gap-2 px-6 pb-3" onPress={onBack}>
      <ThemedText type="labelSm" color={primary}>
        ← BACK
      </ThemedText>
      <ThemedText type="headlineSm" numberOfLines={1} className="flex-1">
        {title}
      </ThemedText>
    </Touchable>
  );
}
