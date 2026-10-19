import type { FlashListRef } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import React from 'react';

import { useCurrentSegment } from '@/features/podcasts/hooks/use-current-segment';
import { useTranscriptActions } from '@/features/podcasts/hooks/use-transcript-actions';
import {
  isTimed,
  matchLabel,
  transcriptMatches,
  transcriptRows,
  type TranscriptRow,
} from '@/features/podcasts/utils/transcript-rows';
import { createTranscriptQueryOptions } from '@/query-manager/transcripts';
import { usePodcastPlayer } from '@/stores/podcast-player';

const NO_ROWS: TranscriptRow[] = [];
/** Where the lit row sits while following: about a third down the sheet. */
const FOLLOW_AT = 0.33;

/**
 * The transcript sheet: the rows, the lit one, following the audio, and
 * search. While playing, the list keeps the lit row about a third down;
 * dragging the list stops that, and "Back to now" starts it again. Search
 * counts its matches in the header and jumps between them without filtering,
 * so the lines around each stay in view.
 */
export function useTranscriptSheet({ episodeId, visible, preparing }: { episodeId: string | null; visible: boolean; preparing: boolean }) {
  const query = useQuery(createTranscriptQueryOptions(episodeId ?? '', { enabled: visible && episodeId !== null }));
  const doc = query.data ?? null;
  const rows = React.useMemo(() => (doc ? transcriptRows(doc) : NO_ROWS), [doc]);
  const starts = React.useMemo(() => rows.map((row) => row.start), [rows]);
  const isCurrent = usePodcastPlayer((s) => s.current?.episodeId === episodeId);
  const timed = doc ? isTimed(doc) : false;
  const current = useCurrentSegment(starts, visible && isCurrent && timed);

  const list = React.useRef<FlashListRef<TranscriptRow>>(null);
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
  const matches = React.useMemo(() => (doc ? transcriptMatches(doc, deferred) : []), [doc, deferred]);
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

  const actions = useTranscriptActions({ episodeId, doc, isCurrent });
  const lit = current;
  const match = matches.length > 0 ? matches[at] : -1;

  return {
    rows,
    loading: preparing || (query.isPending && visible),
    empty: !preparing && query.isSuccess && doc === null,
    lit,
    match,
    listRef: list,
    showBackToNow: isCurrent && timed && !following && current >= 0,
    onBackToNow: () => setFollowing(true),
    onDrag: () => setFollowing(false),
    search: { onChange: setSearch, label: matchLabel(matches.length, at, deferred), onNext: () => step(1), onPrev: () => step(-1) },
    ...actions,
  };
}

export type TranscriptSheetState = ReturnType<typeof useTranscriptSheet>;
