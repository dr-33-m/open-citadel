import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { asColor } from '@/utils/colors';

/**
 * One settings group, and the two pieces every group shares: the hairline
 * divider above it and the letter-spaced gold label.
 *
 * These used to rise and fade in one at a time, on a stagger. They no longer
 * animate at all, because the screen now arrives by dissolving a placeholder
 * of these same sections into the real ones — and a section that then slid up
 * from its own offset would be a second entrance played over the first, moving
 * content the user had already been shown sitting still. The screen's entrance
 * belongs to the screen; a section's job is to be where the placeholder said
 * it would be.
 */
export function SettingsSection({
  label,
  divider = true,
  className = 'mt-8 gap-4',
  children,
}: {
  label?: string;
  divider?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      {divider && <View className="h-px bg-surface-tertiary mt-4" />}
      <View className={className}>
        {label && <SectionLabel>{label}</SectionLabel>}
        {children}
      </View>
    </>
  );
}

/** The gold letter-spaced section heading. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  const [primary] = useCSSVariable(['--color-primary']);
  return (
    <ThemedText type="labelMd" color={asColor(primary)} className="tracking-[1.2px]">
      {children}
    </ThemedText>
  );
}

/** The hairline between groups, for sections that compose their own wrapper. */
export function SectionDivider() {
  return <View className="h-px bg-surface-tertiary mt-4" />;
}
