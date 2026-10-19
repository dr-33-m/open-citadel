import React from 'react';

import { InfoSheet, type InfoContent } from '@/components/info-sheet';
import { PlansSheet } from '@/features/billing/components/plans-sheet';
import { SpeakerNameSheet } from '@/features/podcasts/components/speaker-name-sheet';
import { TranscribeSheet } from '@/features/podcasts/components/transcribe-sheet';
import { TranscriptMenuSheet } from '@/features/podcasts/components/transcript-menu-sheet';
import { TranscriptSheet } from '@/features/podcasts/components/transcript-sheet';
import type { EpisodeTranscript } from '@/features/podcasts/hooks/use-episode-transcript';
import { useTranscriptSheet } from '@/features/podcasts/hooks/use-transcript-sheet';

const TRANSCRIBE_INFO: InfoContent = {
  label: 'TRANSCRIPTS',
  title: 'How transcribing works',
  line: 'ElevenLabs Scribe writes down every word, and Samwell works out who is speaking.',
  points: [
    'Every line is marked with its speaker and its time.',
    'The transcript stays on this phone. The server keeps no copy once it arrives.',
    'You are charged the real cost, and only when the transcript arrives.',
    'If it fails or you stop it, nothing is charged.',
  ],
};

type EpisodeTranscriptSheetsProps = {
  transcript: EpisodeTranscript;
  /** Under the transcript's title: "The Show · 1 hr 30 min". */
  line: string;
};

/** The transcript sheet with its row menu and rename. A container: its hook re-renders this, not the screen. */
function TranscriptSheetHost({ transcript, line }: EpisodeTranscriptSheetsProps) {
  const { listRef, ...state } = useTranscriptSheet({
    episodeId: transcript.transcript.episodeId,
    visible: transcript.transcript.visible,
    preparing: transcript.transcript.preparing,
  });
  return (
    <>
      <TranscriptSheet visible={transcript.transcript.visible} onClose={transcript.transcript.onClose} line={line} state={state} listRef={listRef} />
      <TranscriptMenuSheet {...state.menu} />
      <SpeakerNameSheet {...state.rename} />
    </>
  );
}

/**
 * Every sheet an episode's transcript buttons open: the confirm sheet and its
 * "i", the plans where the wall is, and the transcript itself. One host for
 * the player and the episode page, so the two open the same things.
 */
export function EpisodeTranscriptSheets({ transcript, line }: EpisodeTranscriptSheetsProps) {
  return (
    <>
      <TranscribeSheet {...transcript.confirm} />
      <InfoSheet {...transcript.info} info={TRANSCRIBE_INFO} nested />
      <PlansSheet {...transcript.plans} line="Transcripts come with every plan." />
      <TranscriptSheetHost transcript={transcript} line={line} />
    </>
  );
}
