import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useColors } from '@/hooks/use-colors';

type ProgressRingProps = {
  progress: number; // 0..1
  size?: number;
  strokeWidth?: number;
  color?: string;
  children?: React.ReactNode;
};

/** A thin donut ring with a small dot at the leading edge; center holds `children`. */
export function ProgressRing({
  progress,
  size = 116,
  strokeWidth = 4,
  color,
  children,
}: ProgressRingProps) {
  const colors = useColors();
  const ringColor = color ?? colors.primary.default;

  const clamped = Math.min(1, Math.max(0, progress));
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * clamped;

  // Leading dot position (arc starts at 12 o'clock, sweeps clockwise).
  const angle = clamped * 2 * Math.PI - Math.PI / 2;
  const dotX = cx + radius * Math.cos(angle);
  const dotY = cy + radius * Math.sin(angle);

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        wrap: { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
        center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
      }),
    [size],
  );

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size}>
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          stroke={colors.surface.highest}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          stroke={ringColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        <Circle cx={dotX} cy={dotY} r={strokeWidth} fill={ringColor} />
      </Svg>
      <View style={styles.center}>{children}</View>
    </View>
  );
}
