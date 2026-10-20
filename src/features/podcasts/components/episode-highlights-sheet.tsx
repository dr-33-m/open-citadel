import React from 'react';
import { View } from 'react-native';

import { HighlightMenu } from '@/components/reader/highlight-menu';
import { HighlightsTab } from '@/components/reader/toc-highlights-tab';
import type { RowColors } from '@/components/reader/toc-shared';
import { TocHighlightsSkeleton } from '@/components/skeletons/toc-highlights-skeleton';
import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';
import type { EpisodeHighlights } from '@/features/podcasts/hooks/use-episode-highlights';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/**
 * An episode's highlights in the reader's own highlights list (the contents
 * sheet's Highlights tab): search, the colour filters, tags, each row with
 * its moment. A tap plays from it; a long press opens its sheet. Fixed
 * height, as the contents sheet is, with the title pinned above the list.
 */
export function EpisodeHighlightsSheet({ highlights }: { highlights: EpisodeHighlights }) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];
  const colors = React.useMemo<RowColors>(() => ({ primary: tokens['--color-primary'], mutedForeground: muted }), [muted, tokens]);
  const { sheet, editor } = highlights;

  return (
    <>
      <Sheet visible={sheet.visible} onClose={sheet.onClose} fixedHeightRatio={0.85}>
        <View className="gap-1 px-6">
          <ThemedText type="headlineSm">Highlights</ThemedText>
          <ThemedText type="bodySm" color={muted} numberOfLines={1}>
            {sheet.title}
          </ThemedText>
        </View>
        <Sheet.Deferred skeleton={<TocHighlightsSkeleton />}>
          <HighlightsTab
            highlights={sheet.highlights}
            onHighlightPress={sheet.onPress}
            onHighlightLongPress={sheet.onLongPress}
            colors={colors}
          />
        </Sheet.Deferred>
      </Sheet>
      {editor ? <HighlightMenu {...editor} /> : null}
    </>
  );
}
