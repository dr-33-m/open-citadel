import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

/** The brain picker's title row. */
export function ModelPickerHeader({ title }: { title: string }) {
  return (
    <View className="px-6 pb-3">
      <ThemedText type="headlineSm">{title}</ThemedText>
    </View>
  );
}
