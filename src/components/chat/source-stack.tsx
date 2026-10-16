import React from 'react';
import { View } from 'react-native';

import { SourceFavicon } from '@/components/chat/source-favicon';
import { ChevronUp } from '@/components/icons';
import { Text } from '@/components/ui/text';
import { Touchable } from '@/components/ui/touchable';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { asColor } from '@/utils/colors';
import { stackedSources } from '@/utils/web-sources';
import type { WebSource } from 'samwell-shared';

const ICON = 20;

interface SourceStackProps {
  sources: readonly WebSource[];
  /** Opens the list of every source, in a sheet. */
  onOpen: (sources: readonly WebSource[]) => void;
}

/**
 * The web pages a reply drew on, as a row of their sites' icons, the first
 * few overlapping, then "Sources" and an arrow pointing up at the sheet a tap
 * raises. Only for replies that searched the web; the library is cited in the
 * reply itself, as the books and highlights it shows.
 */
export const SourceStack = React.memo(function SourceStack({ sources, onOpen }: SourceStackProps) {
  const muted = asColor(useThemeTokens()['--color-muted-foreground']);
  const stacked = React.useMemo(() => stackedSources(sources), [sources]);
  const open = React.useCallback(() => onOpen(sources), [onOpen, sources]);
  const label = sources.length === 1 ? 'One source. Show it.' : `${sources.length} sources. Show them.`;

  return (
    <Touchable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      className="flex-row items-center gap-2 self-start py-1"
    >
      <View className="flex-row">
        {stacked.map((source, index) => (
          // Each icon is ringed in the page's own colour, so where they
          // overlap reads as one in front of the next rather than a smudge.
          <SourceFavicon
            key={source.url}
            url={source.url}
            size={ICON}
            muted={muted}
            className={index === 0 ? 'border border-background' : '-ms-1.5 border border-background'}
          />
        ))}
      </View>
      <Text className="text-sm text-muted-foreground">Sources</Text>
      <ChevronUp size={14} color={muted} />
    </Touchable>
  );
});
