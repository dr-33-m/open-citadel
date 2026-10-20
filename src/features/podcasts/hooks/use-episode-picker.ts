import { useQuery } from '@tanstack/react-query';
import React from 'react';

import { showToast } from '@/components/toast/toast-provider';
import { createTranscribedEpisodesQueryOptions } from '@/query-manager/transcripts';
import { fetchFeedTranscript } from '@/services/podcasts/transcript/feed';
import type { TranscribedEpisode } from '@/services/podcasts/transcript/library';
import { ensureEpisodeBook } from '@/services/podcasts/transcript/store';
import type { TranscriptWindow } from '@/services/podcasts/transcript/windows';

type PickedEpisode = { id: string; title: string; kind: 'episode' };

/**
 * Samwell's episode picker: whether it is open, which window it shows (This
 * week to begin with), the episodes with a transcript in it, and picking one.
 * An episode whose show publishes a transcript is fetched on the pick, as a
 * post's reader copy is made on its pick, since that is what the chat is
 * grounded in.
 */
export function useEpisodePicker(onPicked: (episode: PickedEpisode) => void) {
  const [visible, setVisible] = React.useState(false);
  const [window, setWindow] = React.useState<TranscriptWindow>('week');
  const { data } = useQuery({ ...createTranscribedEpisodesQueryOptions(window), enabled: visible });

  const close = React.useCallback(() => setVisible(false), []);
  const select = React.useCallback(
    async (episode: TranscribedEpisode) => {
      setVisible(false);
      try {
        if (!episode.ready) await fetchFeedTranscript(episode.id);
        const bookId = await ensureEpisodeBook(episode.id);
        if (bookId) onPicked({ id: bookId, title: episode.title, kind: 'episode' });
      } catch {
        showToast({ message: "The show's transcript couldn't be read.", key: 'transcribe' });
      }
    },
    [onPicked],
  );

  return { setVisible, sheet: { visible, episodes: data, window, onWindow: setWindow, onSelect: select, onClose: close } };
}
