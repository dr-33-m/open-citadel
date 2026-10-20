import { useQuery } from '@tanstack/react-query';
import React from 'react';

import { useCurrentSegment } from '@/features/podcasts/hooks/use-current-segment';
import { useEpisodeHighlightEditor } from '@/features/podcasts/hooks/use-episode-highlight-editor';
import { useTranscriptActions } from '@/features/podcasts/hooks/use-transcript-actions';
import { useTranscriptFollow } from '@/features/podcasts/hooks/use-transcript-follow';
import { markedLines } from '@/features/podcasts/utils/transcript-highlights';
import { followLines, lineMatches, type TranscriptLine } from '@/features/podcasts/utils/transcript-lines';
import { isTimed, matchLabel } from '@/features/podcasts/utils/transcript-rows';
import { createEpisodeHighlightsQueryOptions, createTranscriptQueryOptions } from '@/query-manager/transcripts';
import type { EpisodeHighlight } from '@/services/podcasts/transcript/highlights';
import { usePodcastPlayer } from '@/stores/podcast-player';

const NO_LINES: TranscriptLine[] = [];
const NO_HIGHLIGHTS: EpisodeHighlight[] = [];
/** Where a search match is brought to: near the top, under the field. */
const MATCH_AT = 0.2;
/** The time column: "12:04", or "1:02:04" in an episode of an hour or more. */
const GUTTER = 52;
const GUTTER_HOURS = 68;

/**
 * The transcript sheet, read like lyrics: the lines, the one being spoken,
 * following the audio (`useTranscriptFollow`), and search. While following,
 * the other lines step back; once the list is dragged every line comes up to
 * full strength, for reading. Search counts its matches in the header and
 * jumps between them without filtering, so the lines around each stay in view.
 * Highlighted lines carry the marker behind their words.
 */
export function useTranscriptSheet({ episodeId, visible, preparing }: { episodeId: string | null; visible: boolean; preparing: boolean }) {
  const query = useQuery(createTranscriptQueryOptions(episodeId ?? '', { enabled: visible && episodeId !== null }));
  const doc = query.data ?? null;
  const lines = React.useMemo(() => (doc ? followLines(doc) : NO_LINES), [doc]);
  const starts = React.useMemo(() => lines.map((line) => line.start), [lines]);
  const kept = useQuery(createEpisodeHighlightsQueryOptions(episodeId ?? '', { enabled: visible && episodeId !== null })).data;
  const marked = React.useMemo(() => markedLines(lines, kept ?? []), [lines, kept]);
  const isCurrent = usePodcastPlayer((s) => s.current?.episodeId === episodeId);
  const timed = doc ? isTimed(doc) : false;
  const current = useCurrentSegment(starts, visible && isCurrent && timed);

  const { listRef, from, epoch, placing, following, jump, cover, onListLoad, onStartReached, follow, stopFollowing, onDrag } =
    useTranscriptFollow({ visible, current });
  const data = React.useMemo(() => (from > 0 ? lines.slice(from) : lines), [lines, from]);

  const [search, setSearch] = React.useState('');
  const deferred = React.useDeferredValue(search);
  const matches = React.useMemo(() => lineMatches(lines, deferred), [lines, deferred]);
  const [at, setAt] = React.useState(0);
  // A new search starts at its first match, and stops following to show it.
  const [seen, setSeen] = React.useState(matches);
  if (seen !== matches) {
    setSeen(matches);
    setAt(0);
    if (matches.length > 0) {
      stopFollowing();
      cover(matches[0], MATCH_AT);
    }
  }
  React.useEffect(() => {
    if (matches.length > 0) jump(matches[0], MATCH_AT);
  }, [jump, matches]);
  const step = (by: number) => {
    if (matches.length === 0) return;
    const next = (at + by + matches.length) % matches.length;
    setAt(next);
    stopFollowing();
    cover(matches[next], MATCH_AT);
    jump(matches[next], MATCH_AT);
  };

  const editor = useEpisodeHighlightEditor(visible ? episodeId : null, kept ?? NO_HIGHLIGHTS);
  const actions = useTranscriptActions({ episodeId, doc, lines, marked, onEditHighlight: editor.open });
  const { onRow: play } = actions;
  // A tap on a line plays from it, and the list follows from there.
  const onRow = React.useCallback(
    (line: TranscriptLine) => {
      follow();
      play(line);
    },
    [follow, play],
  );
  const lit = current;
  const match = matches.length > 0 ? matches[at] : -1;
  const lastStart = starts.at(-1) ?? 0;

  return {
    lines: data,
    loading: preparing || (query.isPending && visible) || (placing && isCurrent && timed),
    // Not while a just-saved transcript is being read back.
    empty: !preparing && query.isSuccess && !query.isFetching && doc === null,
    lit,
    match,
    marked,
    /** The reader's highlight sheet for a highlighted line, once one has been opened. */
    editor: editor.menu,
    dim: following && current >= 0,
    gutter: !timed ? 0 : lastStart >= 3600 ? GUTTER_HOURS : GUTTER,
    listRef,
    playing: isCurrent,
    showBackToNow: isCurrent && timed && !following && current >= 0,
    onBackToNow: follow,
    onDrag,
    onListLoad,
    onStartReached,
    listKey: String(epoch),
    search: { onChange: setSearch, label: matchLabel(matches.length, at, deferred), onNext: () => step(1), onPrev: () => step(-1) },
    ...actions,
    onRow,
  };
}

export type TranscriptSheetState = ReturnType<typeof useTranscriptSheet>;
