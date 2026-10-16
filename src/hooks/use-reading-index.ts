import { useEffect } from 'react';

import { warmReadingIndex } from '@/services/book-text/reading';

/**
 * Long enough after launch that the first screen, the library scan and the
 * podcast refresh have all had the phone first.
 */
const AFTER_LAUNCH_MS = 30_000;

/**
 * Fills Samwell's book text index in the background once the app has
 * settled, a book at a time, so his first search of the day answers at once
 * instead of reading books while the reader waits. The books store warms it
 * again when a scan brings new ones in.
 */
export function useReadingIndex(dbReady: boolean): void {
  useEffect(() => {
    if (!dbReady) return;
    const timer = setTimeout(warmReadingIndex, AFTER_LAUNCH_MS);
    return () => clearTimeout(timer);
  }, [dbReady]);
}
