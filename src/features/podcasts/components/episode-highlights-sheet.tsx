import React from 'react';
import { View } from 'react-native';

import { QuoteExportCard } from '@/components/export/quote-export-card';
import { FitSheet } from '@/components/fit-sheet';
import { ThemedText } from '@/components/themed-text';
import { TranscriptMenuSheet } from '@/features/podcasts/components/transcript-menu-sheet';
import { TranscriptRow, type TranscriptRowColors } from '@/features/podcasts/components/transcript-row';
import type { EpisodeHighlights } from '@/features/podcasts/hooks/use-episode-highlights';
import type { TranscriptLine } from '@/features/podcasts/utils/transcript-lines';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { DEFAULT_HIGHLIGHT_COLOR } from '@/services/highlights';

const CONTENT = { paddingBottom: 16 } as const;
/** Kept lines have no speaker heading to tap. */
const noHeading = (_line: TranscriptLine) => {};

/**
 * An episode's highlights, drawn as the transcript draws its lines (the time,
 * then the words in the serif), in the order they are said. A tap plays from
 * one; a long press opens its menu. As tall as the highlights are, up to most
 * of the screen.
 */
export function EpisodeHighlightsSheet({ highlights }: { highlights: EpisodeHighlights }) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];
  const colors = React.useMemo<TranscriptRowColors>(
    () => ({ ink: tokens['--color-foreground'], gold: tokens['--color-primary'], muted, band: tokens['--color-muted'], mark: DEFAULT_HIGHLIGHT_COLOR }),
    [muted, tokens],
  );
  const { sheet } = highlights;

  const header = (
    <View className="gap-1 px-6 pb-3">
      <ThemedText type="headlineSm">Highlights</ThemedText>
      <ThemedText type="bodySm" color={muted} numberOfLines={1}>
        {sheet.title}
      </ThemedText>
    </View>
  );

  return (
    <>
      <FitSheet visible={sheet.visible} onClose={sheet.onClose} header={header} contentStyle={CONTENT}>
        {sheet.lines.map((line) => (
          <TranscriptRow
            key={line.index}
            line={line}
            lit={false}
            dim={false}
            match={false}
            gutter={sheet.gutter}
            colors={colors}
            onPress={sheet.onPress}
            onLongPress={sheet.onLongPress}
            onHeading={noHeading}
          />
        ))}
      </FitSheet>
      <TranscriptMenuSheet {...highlights.menu} />
      <QuoteExportCard {...highlights.card} />
    </>
  );
}
