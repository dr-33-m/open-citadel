import React from 'react';
import { View } from 'react-native';

import { Star } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { iconSize } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type PlayerTitleProps = {
  title: string;
  /** Whose it is: the show, or a book's author. */
  subtitle: string;
  /** What a tap on the line under the title does, and what a screen reader says it does. */
  onSubtitle?: () => void;
  subtitleLabel?: string;
  favorite: boolean;
  onToggleFavorite: () => void;
};

/** What is playing and whose it is, with the favourite star at its side. */
export function PlayerTitle({ title, subtitle, onSubtitle, subtitleLabel, favorite, onToggleFavorite }: PlayerTitleProps) {
  const tokens = useThemeTokens();
  return (
    <View className="flex-row items-start gap-3">
      <View className="flex-1 gap-1">
        <ThemedText type="headlineMd" numberOfLines={2}>
          {title}
        </ThemedText>
        <Touchable
          onPress={onSubtitle}
          disabled={!onSubtitle}
          hitSlop={6}
          accessibilityRole={onSubtitle ? 'link' : 'text'}
          accessibilityLabel={subtitleLabel ?? subtitle}
        >
          <ThemedText type="bodySm" color={tokens['--color-muted-foreground']} numberOfLines={1}>
            {subtitle}
          </ThemedText>
        </Touchable>
      </View>
      <Touchable
        className="h-10 w-10 items-center justify-center"
        haptic="tap"
        onPress={onToggleFavorite}
        accessibilityRole="button"
        accessibilityLabel={favorite ? 'Remove from Favorites' : 'Add to Favorites'}
        accessibilityState={{ selected: favorite }}
      >
        {/* Filled when it is one: an outline in gold read as an offer, not a state. */}
        <Star
          size={iconSize.default}
          color={favorite ? tokens['--color-primary'] : tokens['--color-muted-foreground']}
          fill={favorite ? tokens['--color-primary'] : 'none'}
        />
      </Touchable>
    </View>
  );
}
