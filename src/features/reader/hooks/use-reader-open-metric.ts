import React from 'react';

import { startTimer, track } from '@/lib/observe';

/**
 * How long the reader takes to open: from the screen mounting to the first
 * page actually drawn (`readerPainted`), the wait every book, post and
 * transcript opens through. Sent once per opening, with the kind of thing
 * opened. The screen's interactive mark is `ScreenInteractive`, drawn by the
 * reader, so the router is read by that one small node and not by the reader.
 */
export function useReaderOpenMetric(painted: boolean, kind: string | null): void {
  const [elapsed] = React.useState(startTimer);
  const sent = React.useRef(false);

  React.useEffect(() => {
    if (!painted || sent.current) return;
    sent.current = true;
    track({ name: 'reader.open', attributes: { kind: kind ?? 'book', ms: elapsed() } });
  }, [painted, kind, elapsed]);
}
