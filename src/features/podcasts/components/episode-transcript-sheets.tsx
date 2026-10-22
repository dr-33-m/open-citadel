import React from 'react';

import { FollowAlongMenuSheet } from '@/components/follow-along/follow-along-menu-sheet';
import { InfoSheet, type InfoContent } from '@/components/info-sheet';
import { HighlightMenu } from '@/components/reader/highlight-menu';
import { PlansSheet } from '@/features/billing/components/plans-sheet';
import { SpeakerNameSheet } from '@/features/podcasts/components/speaker-name-sheet';
import { TranscribeSheet } from '@/features/podcasts/components/transcribe-sheet';
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

type TranscriptViewerProps = {
  episodeId: string | null;
  visible: boolean;
  onClose: () => void;
  /** The show's transcript being fetched for the first open: the skeleton stays. */
  preparing?: boolean;
  /** Under the transcript's title: "The Show · 1 hr 30 min". */
  line: string;
};

/**
 * The transcript sheet with its row menu and rename, wherever a transcript
 * is opened: the player, the episode page, an episode chat's badge. A
 * container: its hook re-renders this, not the screen.
 */
export function TranscriptViewer({ episodeId, visible, onClose, preparing = false, line }: TranscriptViewerProps) {
  const { listRef, ...state } = useTranscriptSheet({ episodeId, visible, preparing });
  return (
    <>
      <TranscriptSheet visible={visible} onClose={onClose} line={line} state={state} listRef={listRef} />
      <FollowAlongMenuSheet {...state.menu} />
      {state.editor ? <HighlightMenu {...state.editor} /> : null}
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
      <TranscriptViewer {...transcript.transcript} line={line} />
    </>
  );
}
