import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';

import { showToast } from '@/components/toast/toast-provider';
import { useTranscribeConfirm, type ConfirmReason } from '@/features/podcasts/hooks/use-transcribe-confirm';
import { transcriptButtons, transcriptView } from '@/features/podcasts/utils/transcript-state';
import { createTranscribeJobQueryOptions } from '@/query-manager/transcripts';
import type { EpisodeItem } from '@/services/podcasts/records';
import { fetchFeedTranscript } from '@/services/podcasts/transcript/feed';
import { ensureEpisodeBook } from '@/services/podcasts/transcript/store';
import { askSamwellAbout } from '@/services/samwell-handoff';

export type TranscriptEpisode = Pick<
  EpisodeItem,
  'id' | 'title' | 'durationSec' | 'transcriptStatus' | 'transcriptUrl' | 'transcriptJobId'
>;

/**
 * Everything about one episode's transcript, for every place that draws its
 * buttons (the full player, the episode page), so they can never disagree
 * about whether an episode has one.
 *
 * Transcript opens the transcript: the one here, or the show's own, fetched
 * on first open behind the sheet's skeleton, or the confirm sheet when there
 * is neither. Ask Samwell lands on the Samwell page with the episode as the
 * chat's attachment; with no transcript yet it asks for one first, and opens
 * the chat by itself when the job lands while this screen is still up.
 */
export function useEpisodeTranscript(episode: TranscriptEpisode | null) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  // The show's file would not read: the cloud path is offered in its place.
  const [feedFailed, setFeedFailed] = React.useState<string | null>(null);
  const chatWhenReady = React.useRef(false);

  const id = episode?.id ?? null;
  const stored = episode ? transcriptView(episode) : 'none';
  const view = stored === 'feed' && feedFailed === id ? 'none' : stored;
  const jobId = episode?.transcriptJobId ?? null;
  const job = useQuery(createTranscribeJobQueryOptions(jobId ?? '', { enabled: view === 'transcribing' && jobId !== null })).data;
  const progress = job?.progress ?? 0;

  const feed = useMutation({ mutationFn: (episodeId: string) => fetchFeedTranscript(episodeId) });
  const fetchFeed = React.useCallback(
    async (episodeId: string): Promise<boolean> => {
      try {
        await feed.mutateAsync(episodeId);
        return true;
      } catch {
        setFeedFailed(episodeId);
        setSheetOpen(false);
        showToast({ message: "The show's transcript couldn't be read.", key: 'transcribe' });
        return false;
      }
    },
    [feed],
  );

  const openChat = React.useCallback(async () => {
    if (!episode) return;
    const bookId = await ensureEpisodeBook(episode.id);
    if (!bookId) {
      showToast({ message: "This episode's transcript couldn't be opened.", key: 'transcribe' });
      return;
    }
    await askSamwellAbout({ id: bookId, title: episode.title, kind: 'episode' });
    // Down to the hub from the player or a page above it. The audio keeps going.
    if (router.canDismiss()) router.dismissTo('/');
  }, [episode, router]);

  const onStarted = React.useCallback((reason: ConfirmReason) => {
    chatWhenReady.current = reason === 'samwell';
  }, []);
  const confirm = useTranscribeConfirm(episode, { running: view === 'transcribing', progress, onStarted });

  // Started from Ask Samwell and still on screen when it landed: straight to the chat.
  React.useEffect(() => {
    if (view !== 'ready' || !chatWhenReady.current) return;
    chatWhenReady.current = false;
    void openChat();
  }, [openChat, view]);

  const onTranscript = () => {
    if (!id) return;
    if (view === 'ready') setSheetOpen(true);
    else if (view === 'feed') {
      setSheetOpen(true);
      void fetchFeed(id);
    } else confirm.open('transcript');
  };
  const onAskSamwell = () => {
    if (!id || view === 'transcribing') return;
    if (view === 'ready') void openChat();
    else if (view === 'feed') {
      void fetchFeed(id).then((ok) => {
        if (ok) void openChat();
      });
    } else confirm.open('samwell');
  };

  return {
    view,
    buttons: { ...transcriptButtons(view, progress), onTranscript, onAskSamwell },
    confirm: confirm.sheet,
    info: confirm.info,
    plans: confirm.plans,
    transcript: { visible: sheetOpen, onClose: () => setSheetOpen(false), episodeId: id, preparing: feed.isPending },
    openChat,
  };
}

export type EpisodeTranscript = ReturnType<typeof useEpisodeTranscript>;
