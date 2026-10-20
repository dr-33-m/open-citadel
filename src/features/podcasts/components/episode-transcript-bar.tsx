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
  /** In the player's row of tools, as bare icons. */
  tools?: boolean;
};

/**
 * An episode's Transcript and Ask Samwell buttons with the sheets they open. A
 * container: a running job's progress re-renders this, not the player or the
 * page around it.
 */
export function EpisodeTranscriptBar({ episode, line, live, tools }: EpisodeTranscriptBarProps) {
  const transcript = useEpisodeTranscript(episode);
  return (
    <>
      <TranscriptButtons {...transcript.buttons} tools={tools} />
      {live ? <EpisodeTranscriptSheets transcript={transcript} line={line} /> : null}
    </>
  );
}
