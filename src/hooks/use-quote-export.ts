import React from 'react';
import type { View } from 'react-native';

import { captureAndShare } from '@/utils/export-image';

/** What a quote image is drawn from: the words, and where they are from. */
export type Quote = {
  text: string;
  title: string;
  author: string;
  coverUri: string | null;
  /** A small line under the author: a book's category, an episode's moment. */
  detail: string | null;
  squareCover?: boolean;
};

/**
 * Sharing a highlight as an image, for any screen that offers it: the card is
 * drawn off screen, captured once its images have loaded, and handed to the
 * share sheet. One at a time; a second press while one is being made is
 * ignored. Spread `card` onto `QuoteExportCard`.
 */
export function useQuoteExport() {
  const viewRef = React.useRef<View>(null);
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const onReady = React.useCallback(async () => {
    await captureAndShare(viewRef);
    setQuote(null);
  }, []);
  const share = React.useCallback((next: Quote) => setQuote((held) => held ?? next), []);
  return { exporting: quote !== null, share, card: { quote, viewRef, onReady } };
}
