import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { easing, motion, spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { useModelStore } from '@/stores/model';
import { useSettingsStore } from '@/stores/settings';

interface ModelStatusBarProps {
  onPress?: () => void;
}

export function ModelStatusBar({ onPress }: ModelStatusBarProps) {
  const colors = useColors();
  const { models, activeModelId, isLoaded, isLoading, loadError } = useModelStore();
  const { samwellMode, cloudBaseUrl } = useSettingsStore();

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

  if (samwellMode === 'cloud') {
    dotColor = cloudBaseUrl ? '#4caf50' : colors.text.secondary;
  } else if (!activeModel || !activeModel.isDownloaded) {
    dotColor = colors.text.secondary;
  } else if (isLoading) {
    dotColor = '#f2ca50';
    showSpinner = true;
  } else if (isLoaded) {
    dotColor = '#4caf50';
  } else if (loadError) {
    dotColor = '#e53935';
  } else {
    dotColor = colors.text.secondary;
  }

  const statusText = samwellMode === 'cloud' ? 'Grand Maester Samwell' : isLoading ? 'Waking up…' : 'Samwell';

  return (
    <Touchable style={styles.container} onPress={onPress} disabled={samwellMode === 'cloud' || isLoading || isLoaded}>
      {showSpinner ? (
        <ActivityIndicator size="small" color={dotColor} style={{ width: 8, height: 8 }} />
      ) : (
        <View style={styles.dot}>
          {/* Keyed on color: the outgoing dot plays its exit while the new one
              crossfades in, instead of the status hard-swapping color. */}
          <Animated.View
            key={dotColor}
            entering={FadeIn.duration(motion.fast).easing(easing)}
            exiting={FadeOut.duration(motion.fast).easing(easing)}
            style={[StyleSheet.absoluteFillObject, { borderRadius: 3, backgroundColor: dotColor }]}
          />
        </View>
      )}
      <ThemedText type="labelSm" color={colors.text.secondary} style={{ fontSize: 11 }}>
        {statusText}
      </ThemedText>
    </Touchable>
  );
}
