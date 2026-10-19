import React from 'react';

import { EpisodeTranscriptSheets } from '@/features/podcasts/components/episode-transcript-sheets';
import { TranscriptButtons } from '@/features/podcasts/components/transcript-buttons';
import { useEpisodeTranscript, type TranscriptEpisode } from '@/features/podcasts/hooks/use-episode-transcript';

type EpisodeTranscriptBarProps = {
  episode: TranscriptEpisode | null;
  /** Under the transcript's title: "The Show · 1 hr 30 min". */
  line: string;
  /** False while the screen is still opening: the boxes are drawn, the sheets wait. */
  live: boolean;
};

/**
 * An episode's Transcript and Ask Samwell boxes with the sheets they open. A
 * container: a running job's progress re-renders this, not the player or the
 * page around it.
 */
export function EpisodeTranscriptBar({ episode, line, live }: EpisodeTranscriptBarProps) {
  const transcript = useEpisodeTranscript(episode);
  return (
    <>
      <TranscriptButtons {...transcript.buttons} />
      {live ? <EpisodeTranscriptSheets transcript={transcript} line={line} /> : null}
    </>
  );
}
