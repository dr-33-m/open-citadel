import type { UseQueryOptions } from '@tanstack/react-query';
import type { TranscribeJobView, TranscriptDoc } from 'samwell-shared';

import { transcriptKeys } from '@/query-manager/transcripts/keys';
import { transcribeJobStatus } from '@/services/podcasts/transcript/cloud';
import { listEpisodeHighlights, type EpisodeHighlight } from '@/services/podcasts/transcript/highlights';
import { transcribingEpisodes } from '@/services/podcasts/transcript/jobs';
import { listTranscribedEpisodes, type TranscribedEpisode } from '@/services/podcasts/transcript/library';
import { readTranscript } from '@/services/podcasts/transcript/store';
import type { TranscriptWindow } from '@/services/podcasts/transcript/windows';

type Options<T, TData = T> = Omit<UseQueryOptions<T, Error, TData>, 'queryKey' | 'queryFn'>;

/** Read from the phone and changed only by the app's own writes, as the podcast library is. */
const LOCAL = { staleTime: Infinity, gcTime: 5 * 60_000, networkMode: 'always', retry: false } as const;

/** An episode's transcript on this phone, or null when it has none here yet. */
export function createTranscriptQueryOptions(episodeId: string, options?: Options<TranscriptDoc | null>) {
  return {
    ...LOCAL,
    ...options,
    queryKey: transcriptKeys.transcript(episodeId),
    queryFn: () => readTranscript(episodeId),
  } satisfies UseQueryOptions<TranscriptDoc | null>;
}

/** The highlights kept from an episode's transcript, newest first. */
export function createEpisodeHighlightsQueryOptions(episodeId: string, options?: Options<EpisodeHighlight[]>) {
  return {
    ...LOCAL,
    ...options,
    queryKey: transcriptKeys.highlights(episodeId),
    queryFn: async () => listEpisodeHighlights(episodeId),
  } satisfies UseQueryOptions<EpisodeHighlight[]>;
}

/** Episodes with a transcript whose latest moment falls in the window, newest first. */
export function createTranscribedEpisodesQueryOptions(window: TranscriptWindow, options?: Options<TranscribedEpisode[]>) {
  return {
    ...LOCAL,
    ...options,
    queryKey: transcriptKeys.transcribed(window),
    queryFn: async () => listTranscribedEpisodes(window),
  } satisfies UseQueryOptions<TranscribedEpisode[]>;
}

type Transcribing = ReturnType<typeof transcribingEpisodes>;

/** The jobs this phone started that have not come home. */
export function createTranscribingQueryOptions(options?: Options<Transcribing>) {
  return {
    ...LOCAL,
    ...options,
    queryKey: transcriptKeys.transcribing(),
    queryFn: async () => transcribingEpisodes(),
  } satisfies UseQueryOptions<Transcribing>;
}

/** How far a cloud job has got, asked every three seconds while it runs. */
export const JOB_POLL_MS = 3_000;

export function createTranscribeJobQueryOptions(jobId: string, options?: Options<TranscribeJobView | null>) {
  return {
    staleTime: 0,
    gcTime: 60_000,
    retry: 1,
    refetchInterval: (query: { state: { data?: TranscribeJobView | null } }) => {
      const status = query.state.data?.status;
      return status === 'ready' || status === 'failed' || query.state.data === null ? false : JOB_POLL_MS;
    },
    ...options,
    queryKey: transcriptKeys.job(jobId),
    queryFn: ({ signal }: { signal: AbortSignal }) => transcribeJobStatus(jobId, signal),
  } satisfies UseQueryOptions<TranscribeJobView | null>;
}
