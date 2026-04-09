import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { useLlamaStore } from '@/stores/llama';

interface ModelStatusBarProps {
  onPress?: () => void;
}

export function ModelStatusBar({ onPress }: ModelStatusBarProps) {
  const colors = useColors();
  const { models, activeModelId, isLoaded, isLoading, loadError } = useLlamaStore();

  const activeModel = models.find((m) => m.id === activeModelId);

  const styles = StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[2],
      alignSelf: 'flex-start',
    },
    dot: {
      width: 5,
      height: 5,
      borderRadius: 3,
    },
  });

  let dotColor: string = colors.text.secondary;
  let showSpinner = false;

  if (!activeModel || !activeModel.isDownloaded) {
    dotColor = colors.text.secondary;
  } else if (isLoading) {
    dotColor = '#f2ca50';
    showSpinner = true;
  } else if (isLoaded) {
    dotColor = '#4caf50';
  } else if (loadError) {
    dotColor = '#e53935';
  } else {
    dotColor = '#f2ca50';
  }

  const statusText = isLoading ? 'Waking up…' : 'Samwell';

  return (
    <Pressable style={styles.container} onPress={onPress} disabled={isLoading || isLoaded}>
      {showSpinner ? (
        <ActivityIndicator size="small" color={dotColor} style={{ width: 8, height: 8 }} />
      ) : (
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
      )}
      <ThemedText type="labelSm" color={colors.text.secondary} style={{ fontSize: 11 }}>
        {statusText}
      </ThemedText>
    </Pressable>
  );
}
