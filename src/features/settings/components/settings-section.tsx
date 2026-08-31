import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Reveal } from '@/components/navigation/reveal';
import { ThemedText } from '@/components/themed-text';
import { asColor } from '@/utils/colors';

/**
 * One settings group, and the two pieces every group shares: the hairline
 * divider above it and the letter-spaced gold label. The wrapper takes the
 * section's own `className` rather than nesting a view — a reveal should
 * not cost a layer.
 *
 * Sections that must be on screen during the drawer's rise mount animated;
 * the rest arrive plain after settle — an entering animation below the fold
 * is work nobody sees. The parent gates `mounted`.
 */
export function SettingsSection({
  index,
  label,
  divider = true,
  className = 'mt-8 gap-4',
  children,
}: {
  index: number;
  label?: string;
  divider?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      {divider && <View className="h-px bg-surface-tertiary mt-4" />}
      <Reveal index={index} className={className}>
        {label && <SectionLabel>{label}</SectionLabel>}
        {children}
      </Reveal>
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
