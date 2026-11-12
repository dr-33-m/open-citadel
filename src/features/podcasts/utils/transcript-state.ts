/**
 * What an episode's transcript buttons say and what the confirm sheet shows,
 * decided once for the player, the episode page and anything else that draws
 * them. Pure.
 */
import { transcriptionCredits, transcriptionSeconds } from 'samwell-shared';

import { formatDuration } from '@/features/podcasts/utils/format';
import type { TranscribeRefusal } from '@/services/podcasts/transcript/cloud';
import { formatCount } from '@/utils/format';

/**
 * Where an episode's transcript is: here, being made, published by the show
 * (free, fetched on first open), or nowhere yet.
 */
export type TranscriptView = 'ready' | 'transcribing' | 'feed' | 'none';

export function transcriptView(episode: {
  transcriptStatus: string;
  transcriptUrl: string | null;
}): TranscriptView {
  if (episode.transcriptStatus === 'ready') return 'ready';
  if (episode.transcriptStatus === 'transcribing') return 'transcribing';
  return episode.transcriptUrl ? 'feed' : 'none';
}

export type TranscriptButtonsView = {
  transcriptLabel: string;
  /** 0 to 1 while a job runs, drawn as a ring; null otherwise. */
  progress: number | null;
  samwellLabel: string;
  samwellDimmed: boolean;
};

export function transcriptButtons(view: TranscriptView, progress: number | null): TranscriptButtonsView {
  if (view === 'transcribing') {
    const pct = Math.round(Math.min(1, Math.max(0, progress ?? 0)) * 100);
    return { transcriptLabel: `Transcribing ${pct}%`, progress: progress ?? 0, samwellLabel: 'Ready soon', samwellDimmed: true };
  }
  return {
    transcriptLabel: view === 'none' ? 'Transcribe' : 'Transcript',
    progress: null,
    samwellLabel: 'Ask Samwell',
    samwellDimmed: false,
  };
}

export type ConfirmFigure = {
  /** "413 Neurons", or the shortfall when there are too few. */
  figure: string;
  /** "1 hr 30 min. You have 7,423." */
  line: string;
  credits: number;
  /** How many more are needed, or null when the balance covers it. */
  short: number | null;
};

/**
 * The confirm sheet's figure. A feed that gives no length is priced at two
 * hours (what the server holds) and said to be "up to" that, since the real
 * cost, charged after, is what the episode turns out to be. A balance not yet
 * known (the server has not answered) is left unsaid, never read as zero.
 */
export function confirmFigure(durationSec: number, available: number | null): ConfirmFigure {
  const known = durationSec > 0;
  const credits = Math.max(1, transcriptionCredits(transcriptionSeconds(durationSec)));
  const short = available != null && credits > available ? credits - available : null;
  const length = known ? formatDuration(durationSec) : 'Length not given';
  return {
    figure: short != null ? `${formatCount(short)} Neurons short` : `${known ? '' : 'Up to '}${formatCount(credits)} Neurons`,
    line: available != null ? `${length}. You have ${formatCount(available)}.` : `${length}.`,
    credits,
    short,
  };
}

/** The toast for a refusal, or null when a sheet answers it instead (plans, the shortfall). */
export function refusalToast(refusal: TranscribeRefusal): string | null {
  switch (refusal) {
    case 'offline':
      return "You're offline. Transcribing needs a connection.";
    case 'too_long':
      return 'This episode is too long to transcribe for now.';
    case 'busy':
      return 'Another episode is still being transcribed.';
    case 'daily_limit':
      return "That's today's transcribing. Try again tomorrow.";
    case 'failed':
      return "The transcript didn't come through. Nothing was charged. Try again.";
    case 'plan_required':
    case 'insufficient_credits':
      return null;
  }
}

/** The toast for a job that ended without a transcript. */
export function jobFailureToast(error: string | undefined): string | null {
  if (error === 'expired') return null;
  if (error === 'audio_unreachable') return "This episode's audio couldn't be reached. Try again later.";
  return "The transcript didn't come through. Nothing was charged. Try again.";
}
