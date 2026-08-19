import { RefreshCw } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

/** A book still syncing down from the cloud — the badge spins continuously
 * so it reads as work-in-progress instead of a static icon. */
export function SyncBadge() {
  const colors = useColors();
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: 1200, easing: Easing.linear }), -1, false);
  }, [rotation]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={[styles.badge, { backgroundColor: colors.surface.base }, spinStyle]}>
      <RefreshCw size={14} color={colors.text.secondary} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: spacing[2],
    left: spacing[2],
    borderRadius: 11,
    padding: 3,
  },
});
