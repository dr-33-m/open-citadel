import { useQueries, useQuery } from '@tanstack/react-query';
import React from 'react';
import { AppState } from 'react-native';

import { showToast } from '@/components/toast/toast-provider';
import { jobFailureToast } from '@/features/podcasts/utils/transcript-state';
import { createTranscribeJobQueryOptions, createTranscribingQueryOptions } from '@/query-manager/transcripts';
import {
  collectEpisodeTranscript,
  pickUpTranscriptions,
  type CollectedTranscript,
} from '@/services/podcasts/transcript/jobs';
import { clearTranscribing } from '@/services/podcasts/transcript/store';
import { useSubscriptionStore } from '@/stores/subscription';

const NONE: { episodeId: string; jobId: string; title: string }[] = [];

/** Said once per job: the watcher and the launch pick-up can both get there. */
function sayReady(collected: CollectedTranscript): void {
  showToast({ message: `Transcript ready: ${collected.title}`, tone: 'success', key: `transcript-ready-${collected.episodeId}` });
}

function sayFailed(episodeId: string, error: string | undefined): void {
  const message = jobFailureToast(error);
  if (message) showToast({ message, key: 'transcribe' });
  clearTranscribing(episodeId);
}

/**
 * The cloud transcripts this phone is waiting on, watched from anywhere in
 * the app: a running job is asked about every three seconds (the same query
 * the buttons read their progress from), and the moment one is ready it is
 * collected, which is when the reader is charged, with a toast saying so. A
 * job that failed clears its episode back to Transcribe.
 *
 * On launch and whenever the app comes to the front, the jobs a closed phone
 * missed are asked about once (`pickUpTranscriptions`).
 */
export function useTranscriptionWatch(ready: boolean): void {
  const transcribing = useQuery(createTranscribingQueryOptions({ enabled: ready })).data ?? NONE;
  const jobs = useQueries({ queries: transcribing.map((t) => createTranscribeJobQueryOptions(t.jobId, { enabled: ready })) });
  const handled = React.useRef(new Set<string>());

  const statuses = jobs.map((job) => (job.data === null ? 'gone' : (job.data?.status ?? 'pending'))).join(',');
  React.useEffect(() => {
    transcribing.forEach((t, i) => {
      const job = jobs[i]?.data;
      if (handled.current.has(t.jobId)) return;
      if (job === null) {
        handled.current.add(t.jobId);
        clearTranscribing(t.episodeId);
      } else if (job?.status === 'ready') {
        handled.current.add(t.jobId);
        collectEpisodeTranscript(t.episodeId, t.jobId)
          .then((collected) => {
            sayReady(collected);
            void useSubscriptionStore.getState().refresh();
          })
          // Left for the next launch's pick-up, inside the day the server keeps it.
          .catch(() => handled.current.delete(t.jobId));
      } else if (job?.status === 'failed') {
        handled.current.add(t.jobId);
        sayFailed(t.episodeId, job.error);
      }
    });
    // `statuses` stands for every job's answer; the arrays are new each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses, transcribing]);

  React.useEffect(() => {
    if (!ready) return;
    const pickUp = () => {
      pickUpTranscriptions()
        .then(({ collected, failed }) => {
          collected.forEach(sayReady);
          if (collected.length > 0) void useSubscriptionStore.getState().refresh();
          failed.forEach((f) => sayFailed(f.episodeId, undefined));
        })
        .catch(() => undefined);
    };
    pickUp();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') pickUp();
    });
    return () => sub.remove();
  }, [ready]);
}
