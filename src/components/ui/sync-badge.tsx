import { RefreshCw } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import { asColor } from '@/utils/colors';

/** A book still syncing down from the cloud — the badge spins continuously
 * so it reads as work-in-progress instead of a static icon. */
export function SyncBadge() {
  // The icon is drawn by react-native-svg (via lucide), which reads `color`
  // as a literal — a className can't reach it.
  const iconColor = asColor(useCSSVariable('--color-muted-foreground'));

  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: 1200, easing: Easing.linear }), -1, false);
  }, [rotation]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    // `rounded-full` rather than the theme's (zeroed) radius scale — this
    // badge was always a circle, and `full` sits outside that scale so it
    // still rounds. The plain View carries the chrome; the Animated.View
    // inside only ever needs the rotation transform.
    <View className="absolute left-2 top-2 rounded-full bg-background" style={{ padding: 3 }}>
      <Animated.View style={spinStyle}>
        <RefreshCw size={14} color={iconColor} />
      </Animated.View>
    </View>
  );
}
