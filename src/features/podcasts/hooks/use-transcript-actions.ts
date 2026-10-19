import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import React from 'react';
import type { TranscriptDoc } from 'samwell-shared';

import { showToast } from '@/components/toast/toast-provider';
import { rowPassage } from '@/features/podcasts/utils/transcript-rows';
import { invalidatePodcastLibrary } from '@/query-manager/podcasts';
import { playEpisode, seekTo, togglePlayback } from '@/services/podcasts/player';
import { ensureEpisodeBook, renameSpeaker } from '@/services/podcasts/transcript/store';
import { showChatOnSamwellPage } from '@/services/samwell-handoff';
import { useChatStore } from '@/stores/chat';
import { usePodcastPlayer } from '@/stores/podcast-player';

export type TranscriptMenuKey = 'ask' | 'copy' | 'reader';

export const TRANSCRIPT_MENU: { key: TranscriptMenuKey; label: string }[] = [
  { key: 'ask', label: 'Ask Samwell about this' },
  { key: 'copy', label: 'Copy' },
  { key: 'reader', label: 'Read in the reader' },
];

/**
 * What a transcript's rows do. A tap plays from the row's start: a seek in
 * the episode already playing, or the episode started there. A long press
 * opens a small menu; a tap on a speaker's name lets the reader correct it
 * for every line they have, which rewrites the JSON and the episode's EPUB so
 * Samwell and search see the right name too.
 */
export function useTranscriptActions({ episodeId, doc, isCurrent }: { episodeId: string | null; doc: TranscriptDoc | null; isCurrent: boolean }) {
  const router = useRouter();
  const [menuRow, setMenuRow] = React.useState<number | null>(null);
  const [renaming, setRenaming] = React.useState<number | null>(null);

  const onRow = React.useCallback(
    (index: number) => {
      const start = doc?.segments[index]?.start;
      if (!episodeId || start == null) return;
      if (!isCurrent) {
        void playEpisode(episodeId, start);
        return;
      }
      seekTo(start);
      if (!usePodcastPlayer.getState().isPlaying) void togglePlayback();
    },
    [doc, episodeId, isCurrent],
  );
  const onLongPress = React.useCallback((index: number) => setMenuRow(index), []);
  const onSpeaker = React.useCallback(
    (index: number) => {
      const speaker = doc?.segments[index]?.speaker;
      if (speaker != null) setRenaming(speaker);
    },
    [doc],
  );

  const readInReader = React.useCallback(async () => {
    if (!episodeId) return;
    const bookId = await ensureEpisodeBook(episodeId);
    if (bookId) router.push({ pathname: '/reader/[id]', params: { id: bookId } });
  }, [episodeId, router]);

  const askAbout = async (index: number) => {
    if (!episodeId || !doc) return;
    const bookId = await ensureEpisodeBook(episodeId);
    if (!bookId) return;
    const { passage, context } = rowPassage(doc, index);
    const sessionId = await useChatStore.getState().createSession({
      bookId,
      title: doc.segments[index].text.slice(0, 60),
      contextText: context,
      passageText: passage,
    });
    await showChatOnSamwellPage(sessionId);
    if (router.canDismiss()) router.dismissTo('/');
  };

  const onMenu = (key: TranscriptMenuKey) => {
    const index = menuRow;
    setMenuRow(null);
    if (index == null || !doc) return;
    if (key === 'ask') void askAbout(index);
    else if (key === 'reader') void readInReader();
    else {
      void Clipboard.setStringAsync(doc.segments[index].text);
      showToast({ message: 'Copied', tone: 'success', key: 'transcript-copy' });
    }
  };

  const onRename = async (name: string) => {
    const speaker = renaming;
    setRenaming(null);
    if (!episodeId || speaker == null) return;
    await renameSpeaker(episodeId, speaker, name);
    invalidatePodcastLibrary();
  };

  return {
    onRow,
    onLongPress,
    onSpeaker,
    readInReader,
    menu: { visible: menuRow !== null, onClose: () => setMenuRow(null), onSelect: onMenu },
    rename: {
      visible: renaming !== null,
      name: renaming != null ? (doc?.speakers[renaming] ?? '') : '',
      onClose: () => setRenaming(null),
      onSave: (name: string) => void onRename(name),
    },
  };
}
