import type { FlashListRef } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import React from 'react';

import { useCurrentSegment } from '@/features/podcasts/hooks/use-current-segment';
import { useTranscriptActions } from '@/features/podcasts/hooks/use-transcript-actions';
import { followLines, lineMatches, type TranscriptLine } from '@/features/podcasts/utils/transcript-lines';
import { isTimed, matchLabel } from '@/features/podcasts/utils/transcript-rows';
import { createTranscriptQueryOptions } from '@/query-manager/transcripts';
import { usePodcastPlayer } from '@/stores/podcast-player';

const NO_LINES: TranscriptLine[] = [];
/** Where the lit line sits while following: about a third down the sheet. */
const FOLLOW_AT = 0.33;
/** The time column: "12:04", or "1:02:04" in an episode of an hour or more. */
const GUTTER = 52;
const GUTTER_HOURS = 68;

/**
 * The transcript sheet, read like lyrics: the lines, the one being spoken,
 * following the audio, and search. While its episode plays, the list keeps
 * the spoken line about a third down and the others step back; dragging the
 * list stops that (every line comes up to full strength, for reading), and
 * "Back to now" or a tap on a line starts it again. Search counts its matches
 * in the header and jumps between them without filtering, so the lines
 * around each stay in view.
 */
export function useTranscriptSheet({ episodeId, visible, preparing }: { episodeId: string | null; visible: boolean; preparing: boolean }) {
  const query = useQuery(createTranscriptQueryOptions(episodeId ?? '', { enabled: visible && episodeId !== null }));
  const doc = query.data ?? null;
  const lines = React.useMemo(() => (doc ? followLines(doc) : NO_LINES), [doc]);
  const starts = React.useMemo(() => lines.map((line) => line.start), [lines]);
  const isCurrent = usePodcastPlayer((s) => s.current?.episodeId === episodeId);
  const timed = doc ? isTimed(doc) : false;
  const current = useCurrentSegment(starts, visible && isCurrent && timed);

  const list = React.useRef<FlashListRef<TranscriptLine>>(null);
  const [following, setFollowing] = React.useState(true);
  const jump = React.useCallback((index: number, viewPosition = FOLLOW_AT) => {
    if (index >= 0) list.current?.scrollToIndex({ index, viewPosition, animated: true });
  }, []);
  React.useEffect(() => {
    if (following && current >= 0) jump(current);
  }, [current, following, jump]);
  // Every opening starts by following.
  const [wasVisible, setWasVisible] = React.useState(visible);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (visible) setFollowing(true);
  }

  const [search, setSearch] = React.useState('');
  const deferred = React.useDeferredValue(search);
  const matches = React.useMemo(() => lineMatches(lines, deferred), [lines, deferred]);
  const [at, setAt] = React.useState(0);
  // A new search starts at its first match, and stops following to show it.
  const [seen, setSeen] = React.useState(matches);
  if (seen !== matches) {
    setSeen(matches);
    setAt(0);
    if (matches.length > 0) setFollowing(false);
  }
  React.useEffect(() => {
    if (matches.length > 0) jump(matches[0], 0.2);
  }, [jump, matches]);
  const step = (by: number) => {
    if (matches.length === 0) return;
    const next = (at + by + matches.length) % matches.length;
    setAt(next);
    setFollowing(false);
    jump(matches[next], 0.2);
  };

  const actions = useTranscriptActions({ episodeId, doc });
  const { onRow: play } = actions;
  // A tap on a line plays from it, and the list follows from there.
  const onRow = React.useCallback(
    (line: TranscriptLine) => {
      setFollowing(true);
      play(line);
    },
    [play],
  );
  const lit = current;
  const match = matches.length > 0 ? matches[at] : -1;
  const lastStart = starts.at(-1) ?? 0;

  return {
    lines,
    loading: preparing || (query.isPending && visible),
    // Not while a just-saved transcript is being read back.
    empty: !preparing && query.isSuccess && !query.isFetching && doc === null,
    lit,
    match,
    dim: following && current >= 0,
    gutter: !timed ? 0 : lastStart >= 3600 ? GUTTER_HOURS : GUTTER,
    listRef: list,
    playing: isCurrent,
    showBackToNow: isCurrent && timed && !following && current >= 0,
    onBackToNow: () => setFollowing(true),
    onDrag: () => setFollowing(false),
    search: { onChange: setSearch, label: matchLabel(matches.length, at, deferred), onNext: () => step(1), onPrev: () => step(-1) },
    ...actions,
    onRow,
  };
}

export type TranscriptSheetState = ReturnType<typeof useTranscriptSheet>;
