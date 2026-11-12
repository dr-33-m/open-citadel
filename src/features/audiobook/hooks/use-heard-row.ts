import React from 'react';

import { heardRow, rowOf, type SentenceRow } from '@/features/audiobook/utils/sentence-rows';
import { useCurrentSegment } from '@/features/podcasts/hooks/use-current-segment';
import { sentenceStarts } from '@/services/audiobook';
import { useAudiobook } from '@/stores/audiobook';
import { usePlayer } from '@/stores/player';

const NO_STARTS: number[] = [];

/**
 * The row of the book's text being heard, lit by the book's clock as a
 * transcript's line is lit by its time (`useCurrentSegment`, shared with the
 * episodes' transcripts): a touch ahead of the words, as lyrics are. The
 * player saying it has moved on to the next sentence (what `sentenceId`
 * follows) only comes once the words have begun, and lit by it the row was
 * late by a tenth of a second or more. Where the clock cannot place a row
 * (the chapter not laid out yet), the sentence the player last named.
 */
export function useHeardRow(rows: readonly SentenceRow[], sentenceId: string | null, visible: boolean) {
  const version = useAudiobook((s) => s.timelineVersion);
  const speed = usePlayer((s) => s.speed);
  // The session the clock is laid out from: none yet for a book restored paused.
  const loaded = usePlayer((s) => s.loaded);
  const section = rows[0]?.sentence.section ?? null;
  const starts = React.useMemo(() => {
    if (!visible || section === null) return null;
    const byId = sentenceStarts(section);
    const out = byId ? rows.map((row) => byId.get(row.sentence.id)) : [];
    return byId && out.every((at) => at !== undefined) ? (out as number[]) : null;
    // Laid out again once the book is loaded, as sentences are measured, as
    // the speed changes, and as the voice moves on: a book whose sentences
    // were all measured before never changes its layout, and laid out at a
    // moment its session was not yet ready it would have stayed unlit by the
    // clock until the sheet was opened again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, section, version, speed, loaded, visible, sentenceId]);
  const segment = useCurrentSegment(starts ?? NO_STARTS, starts !== null);
  const { place: placeRow } = segment;

  /** A sentence the voice has just been sent to (a tap), lit at once. */
  const place = React.useCallback(
    (id: string) => {
      const row = rowOf(rows, id);
      if (row >= 0) placeRow(row);
    },
    [rows, placeRow],
  );

  return { current: heardRow(segment.current, rows, sentenceId), place };
}
