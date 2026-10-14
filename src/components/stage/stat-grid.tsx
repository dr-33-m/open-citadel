import React from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { revealIn } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/** One figure: the number or the word, and what it counts. */
export type Stat = { key: string; value: string; label: string };

type StatGridProps = {
  stats: Stat[];
  /** Where the first tile falls in the screen's reveal. */
  firstStep: number;
};

/**
 * A result as figures rather than a list of sentences: each one in the serif
 * on its own tile, two to a row, arriving one after another.
 *
 * Written for what a podcast import brought across, and moved here when an
 * insider code's plan became the second result to be drawn this way.
 */
export function StatGrid({ stats, firstStep }: StatGridProps) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];
  const rows: Stat[][] = [];
  for (let i = 0; i < stats.length; i += 2) rows.push(stats.slice(i, i + 2));

  return (
    <View className="gap-4 self-stretch">
      {rows.map((row, r) => (
        <View key={row[0].key} className="flex-row gap-4">
          {row.map((stat, c) => (
            <Animated.View key={stat.key} entering={revealIn(firstStep + r * 2 + c)} className="flex-1">
              <Card>
                <View className="gap-2 p-4">
                  <ThemedText type="headlineLg">{stat.value}</ThemedText>
                  <ThemedText type="labelSm" color={muted}>
                    {stat.label}
                  </ThemedText>
                </View>
              </Card>
            </Animated.View>
          ))}
          {/* An odd tile keeps its column rather than stretching across two. */}
          {row.length === 1 ? <View className="flex-1" /> : null}
        </View>
      ))}
    </View>
  );
}
