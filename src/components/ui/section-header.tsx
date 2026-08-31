import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Touchable } from '@/components/ui/touchable';
import { MaxContentWidth } from '@/constants/theme';

import { ThemedText } from '@/components/themed-text';

type SectionHeaderProps = {
  label?: string;
  title: string;
  rightAction?: {
    text: string;
    onPress: () => void;
  };
  rightIcon?: {
    icon: React.ReactNode;
    onPress: () => void;
  };
  count?: string;
};

export function SectionHeader({
  label,
  title,
  rightAction,
  rightIcon,
  count,
}: SectionHeaderProps) {
  // ThemedText's `color` prop takes a literal, never a className — both
  // tokens below feed that prop, the same way as everywhere else in this file.
  const primary = useCSSVariable('--color-primary');
  const mutedForeground = useCSSVariable('--color-muted-foreground');
  const primaryColor = typeof primary === 'string' ? primary : undefined;
  const secondaryColor = typeof mutedForeground === 'string' ? mutedForeground : undefined;

  return (
    // Capped to the shared content column: never bites at phone widths,
    // centres the header over the capped content on wide screens.
    <View
      className="gap-2 px-6"
      style={{ maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' }}
    >
      {label && (
        <ThemedText type="labelSm" color={primaryColor}>
          {label}
        </ThemedText>
      )}
      <View className="flex-row items-baseline gap-3">
        <ThemedText type="headlineSm" className="flex-1">
          {title}
        </ThemedText>
        {count && (
          <ThemedText type="labelSm" color={secondaryColor}>
            {count}
          </ThemedText>
        )}
        {rightIcon && (
          <Touchable onPress={rightIcon.onPress} className="h-7 w-7 items-center justify-center">
            {rightIcon.icon}
          </Touchable>
        )}
        {rightAction && (
          <Touchable onPress={rightAction.onPress}>
            <ThemedText type="labelSm" color={primaryColor}>
              {rightAction.text}
            </ThemedText>
          </Touchable>
        )}
      </View>
    </View>
  );
}
