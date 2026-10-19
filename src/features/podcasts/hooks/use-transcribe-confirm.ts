import { useMutation } from '@tanstack/react-query';
import React from 'react';

import { showToast } from '@/components/toast/toast-provider';
import { confirmFigure, refusalToast } from '@/features/podcasts/utils/transcript-state';
import { TranscribeError } from '@/services/podcasts/transcript/cloud';
import { stopEpisodeTranscription, transcribeEpisode } from '@/services/podcasts/transcript/jobs';
import { useSubscriptionStore } from '@/stores/subscription';

/** Why the sheet is up: the Transcribe button, or Ask Samwell on an episode with no transcript yet. */
export type ConfirmReason = 'transcript' | 'samwell';

export type ConfirmEpisode = { id: string; durationSec: number; transcriptJobId: string | null };

const LINES: Record<ConfirmReason, string> = {
  transcript: 'Read along, find any moment, and talk it through with Samwell.',
  samwell: 'Samwell needs the transcript to talk about this episode.',
};

/**
 * The confirm sheet before a cloud transcript: the cost as a figure, the
 * balance, and the one action. No plan (or nobody signed in) opens the plans
 * where the wall is, never Settings; too few Neurons turns the figure into the
 * shortfall and the action into "See plans". While a job runs the same sheet
 * shows its progress and a Stop.
 *
 * Every refusal is a keyed toast, and nothing is charged by any of them.
 */
export function useTranscribeConfirm(
  episode: ConfirmEpisode | null,
  { running, progress, onStarted }: { running: boolean; progress: number; onStarted: (reason: ConfirmReason) => void },
) {
  const plan = useSubscriptionStore((s) => s.plan);
  const status = useSubscriptionStore((s) => s.status);
  const available = useSubscriptionStore((s) => s.balance.available);
  // Only a server that has answered "no plan" puts the plans up first. Before
  // it answers, the confirm sheet opens and the server's refusal decides.
  const noPlan = plan == null && (status === 'none' || status === 'unavailable');
  const [reason, setReason] = React.useState<ConfirmReason | null>(null);
  const [plansOpen, setPlansOpen] = React.useState(false);
  const [infoOpen, setInfoOpen] = React.useState(false);
  const close = React.useCallback(() => setReason(null), []);

  const open = React.useCallback(
    (why: ConfirmReason) => {
      // A job already running shows its progress whoever has a plan now.
      if (noPlan && !running) setPlansOpen(true);
      else setReason(why);
    },
    [noPlan, running],
  );

  const start = useMutation({
    mutationFn: (id: string) => transcribeEpisode(id),
    onSuccess: () => {
      const why = reason ?? 'transcript';
      setReason(null);
      onStarted(why);
    },
    onError: (error) => {
      const refusal = error instanceof TranscribeError ? error.refusal : 'failed';
      if (refusal === 'plan_required') {
        setReason(null);
        setPlansOpen(true);
        return;
      }
      // The server's balance is the truth; the figure redraws as the shortfall.
      if (refusal === 'insufficient_credits') {
        void useSubscriptionStore.getState().refresh();
        return;
      }
      const message = refusalToast(refusal);
      if (message) showToast({ message, key: 'transcribe' });
    },
  });

  const stop = useMutation({
    mutationFn: ({ id, jobId }: { id: string; jobId: string }) => stopEpisodeTranscription(id, jobId),
    onSettled: () => setReason(null),
  });

  const figure = confirmFigure(episode?.durationSec ?? 0, status === 'active' ? available : null);
  const onAction = () => {
    if (!episode) return;
    if (figure.short != null) setPlansOpen(true);
    else start.mutate(episode.id);
  };
  const onStop = () => {
    if (episode?.transcriptJobId) stop.mutate({ id: episode.id, jobId: episode.transcriptJobId });
  };

  return {
    open,
    sheet: {
      visible: reason !== null,
      onClose: close,
      line: LINES[reason ?? 'transcript'],
      figure: figure.figure,
      figureLine: figure.line,
      short: figure.short != null,
      running: running ? progress : null,
      busy: start.isPending || stop.isPending,
      onAction,
      onStop,
      onInfo: () => setInfoOpen(true),
    },
    info: { visible: infoOpen, onClose: () => setInfoOpen(false) },
    plans: {
      visible: plansOpen,
      onClose: () => setPlansOpen(false),
      // Back to the confirm sheet with a plan in hand, the wall gone.
      onActivated: () => setPlansOpen(false),
      nested: reason !== null,
    },
  };
}

export type TranscribeConfirm = ReturnType<typeof useTranscribeConfirm>;
