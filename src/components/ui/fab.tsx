import { LinearGradient } from 'expo-linear-gradient';
// LOCAL EDIT: icons come from `@/components/icons` (deep lucide imports),
// not the `lucide-react-native` barrel, which drags 1,749 icon modules into
// the bundle. Re-apply after `panelui-cli update`.
import { PencilSparkles, type LucideIcon } from '@/components/icons';
import React from 'react';
import { StyleSheet } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Touchable } from '@/components/ui/touchable';
import { asColor } from '@/utils/colors';
import { elevation, spacing } from '@/constants/theme';

type FabProps = {
  onPress?: () => void;
  /**
   * Extra clearance below the FAB's usual resting position, for a screen with
   * something else floating at its bottom edge. Pass the bottom safe-area
   * inset on a screen whose container reaches the true screen bottom.
   */
  bottomOffset?: number;
  /** The screen's one primary creative action — a new thought, a new book. */
  icon?: LucideIcon;
  accessibilityLabel?: string;
};

/** The button's own size — 52dp square, comfortably past the 44dp minimum. */
const FAB_SIZE = 52;

/**
 * How much bottom padding a screen's scroll content needs so its last row can
 * be scrolled out from under the FAB. The button floats over the content by
 * design; this is what stops the final item from being permanently pinned
 * beneath it.
 */
export function fabClearance(insetsBottom: number): number {
  return spacing[10] + FAB_SIZE + insetsBottom;
}

export function Fab({
  onPress,
  bottomOffset = 0,
  icon: Icon = PencilSparkles,
  accessibilityLabel,
}: FabProps) {
  const [primary, primaryDeep, primaryForeground] = useCSSVariable([
    '--color-primary',
    '--color-primary-deep',
    '--color-primary-foreground',
  ]);
  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        container: {
          position: 'absolute',
          bottom: spacing[10] + bottomOffset,
          right: spacing[6],
        },
        gradient: {
          width: FAB_SIZE,
          height: FAB_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
          ...elevation.card,
        },
      }),
    [bottomOffset],
  );

  return (
    <Touchable
      onPress={onPress}
      style={styles.container}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <LinearGradient
        colors={[asColor(primary)!, asColor(primaryDeep)!]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <Icon size={24} color={asColor(primaryForeground)} strokeWidth={1.8} />
      </LinearGradient>
    </Touchable>
  );
}
