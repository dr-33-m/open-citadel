// LOCAL EDIT: icons come from `@/components/icons` (deep lucide imports),
// not the `lucide-react-native` barrel, which drags 1,749 icon modules into
// the bundle. Re-apply after `panelui-cli update`.
import type { LucideIcon } from '@/components/icons';
import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { iconSize } from '@/constants/theme';

type PrefixIconProps = {
  icon: LucideIcon;
  size?: number;
  color?: string;
};

/**
 * The square, 1px-bordered icon badge that leads a list row — first established
 * on the Compass telemetry strips. House convention for "here's what this row is
 * about" going forward, in place of bare rows or ad-hoc icon treatments.
 */
export function PrefixIcon({ icon: Icon, size = 40, color }: PrefixIconProps) {
  // The icon glyph is drawn by react-native-svg, which reads `color` as a
  // literal — a className can't reach it, so the foreground token is resolved
  // here in JS the same way the border reaches it via `border-border`.
  const foreground = useCSSVariable('--color-foreground');

  return (
    <View
      className="items-center justify-center border border-border"
      style={{ width: size, height: size }}
    >
      <Icon
        size={iconSize.default}
        color={color ?? (typeof foreground === 'string' ? foreground : undefined)}
        strokeWidth={2}
      />
    </View>
  );
}
