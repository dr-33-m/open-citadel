import { podcastKeys } from '@/query-manager/podcasts/keys';
import type { TranscriptWindow } from '@/services/podcasts/transcript/windows';

/**
 * Every transcript query's key.
 *
 * What is read from this phone (a transcript, the picker's list, the jobs it
 * started) sits under the podcast library key, so the one invalidation every
 * podcast write ends with refreshes it too. The job's status is Samwell
 * Cloud's answer, outside it, polled while a job runs.
 */
export const transcriptKeys = {
  transcript: (episodeId: string) => [...podcastKeys.library(), 'transcript', episodeId] as const,
  transcribed: (window: TranscriptWindow) => [...podcastKeys.library(), 'transcribed', window] as const,
  transcribing: () => [...podcastKeys.library(), 'transcribing'] as const,
  /** Invalidated on its own after a highlight is kept or removed: the transcript itself is not read again. */
  highlights: (episodeId: string) => [...transcriptKeys.allHighlights(), episodeId] as const,
  /** Every episode's highlights, for one invalidation when any highlight changes. */
  allHighlights: () => [...podcastKeys.library(), 'highlights'] as const,

  /** The map from the transcript's clock to the copy being played (`time-map.ts`), set when a copy is mapped. */
  timeMap: (episodeId: string) => [...podcastKeys.library(), 'time-map', episodeId] as const,

  job: (jobId: string) => ['transcripts', 'job', jobId] as const,
};
