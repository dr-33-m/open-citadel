import React from 'react';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { easing, motion } from '@/constants/theme';
import { useModelStore } from '@/stores/model';
import { useSettingsStore } from '@/stores/settings';
import { asColor } from '@/utils/colors';

interface ModelStatusBarProps {
  onPress?: () => void;
}

export function ModelStatusBar({ onPress }: ModelStatusBarProps) {
  // The dot is drawn inside Reanimated nodes, so its colour has to be a
  // resolved literal, not a class.
  const [primary, success, destructive, mutedForeground] = useCSSVariable([
    '--color-primary',
    '--color-success',
    '--color-destructive',
    '--color-muted-foreground',
  ]);
  const { models, activeModelId, isLoaded, isLoading, loadError } = useModelStore();
  const samwellMode = useSettingsStore((s) => s.samwellMode);
  const cloudBaseUrl = useSettingsStore((s) => s.cloudBaseUrl);

  const activeModel = models.find((m) => m.id === activeModelId);

  let dotColor: string | undefined = asColor(mutedForeground);
  let waking = false;

  if (samwellMode === 'cloud') {
    dotColor = cloudBaseUrl ? asColor(success) : asColor(mutedForeground);
  } else if (!activeModel || !activeModel.isDownloaded) {
    dotColor = asColor(mutedForeground);
  } else if (isLoading) {
    dotColor = asColor(primary);
    waking = true;
  } else if (isLoaded) {
    dotColor = asColor(success);
  } else if (loadError) {
    dotColor = asColor(destructive);
  } else {
    dotColor = asColor(mutedForeground);
  }

  const statusText = samwellMode === 'cloud' ? 'Grand Maester Samwell' : 'Samwell';

  // Pulses in place of a spinner/label swap while waking up — the "wake up"
  // card already tells the user what's happening in detail, so the dot only
  // needs to read as "in progress" here, then settle to solid green.
  const pulseOpacity = useSharedValue(1);
  React.useEffect(() => {
    if (waking) {
      pulseOpacity.value = withRepeat(withTiming(0.3, { duration: 600, easing }), -1, true);
    } else {
      pulseOpacity.value = withTiming(1, { duration: motion.fast, easing });
    }
  }, [waking, pulseOpacity]);
  const pulseAnimatedStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  return (
    <Touchable className="flex-row items-center gap-2 self-start" onPress={onPress} disabled={samwellMode === 'cloud' || isLoading || isLoaded}>
      <Animated.View style={[{ width: 5, height: 5, borderRadius: 3 }, pulseAnimatedStyle]}>
        {/* Keyed on color: the outgoing dot plays its exit while the new one
            crossfades in, instead of the status hard-swapping color. */}
        <Animated.View
          key={dotColor}
          entering={FadeIn.duration(motion.fast).easing(easing)}
          exiting={FadeOut.duration(motion.fast).easing(easing)}
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: 3,
              backgroundColor: dotColor,
            },
          ]}
        />
      </Animated.View>
      <ThemedText type="labelSm" color={asColor(mutedForeground)} style={{ fontSize: 11 }}>
        {statusText}
      </ThemedText>
    </Touchable>
  );
}
