import React from 'react';
import { View } from 'react-native';

import { ExportImageCard } from '@/components/export/export-image-card';
import type { Quote } from '@/hooks/use-quote-export';

/** Where the card is drawn: in the tree, so it can be captured, but never seen. */
const OFFSCREEN = { position: 'absolute', left: -9999, top: -9999 } as const;

type QuoteExportCardProps = {
  quote: Quote | null;
  viewRef: React.RefObject<View | null>;
  onReady: () => void;
};

/** The quote image being made, off screen; nothing while none is. From `useQuoteExport`. */
export function QuoteExportCard({ quote, viewRef, onReady }: QuoteExportCardProps) {
  if (!quote) return null;
  return (
    <View style={OFFSCREEN} pointerEvents="none">
      <ExportImageCard
        viewRef={viewRef}
        quoteText={quote.text}
        bookTitle={quote.title}
        authorName={quote.author}
        coverUri={quote.coverUri}
        category={quote.detail}
        squareCover={quote.squareCover}
        onReady={onReady}
      />
    </View>
  );
}
