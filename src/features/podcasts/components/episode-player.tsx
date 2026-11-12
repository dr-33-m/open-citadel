import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { contentColumn } from '@/constants/theme';
import { EpisodeActionSheet } from '@/features/podcasts/components/episode-action-sheet';
import { EpisodeHighlightsSheet } from '@/features/podcasts/components/episode-highlights-sheet';
import { EpisodeTranscriptBar } from '@/features/podcasts/components/episode-transcript-bar';
import { PlayerArtwork } from '@/features/podcasts/components/player-artwork';
import { PlayerControls } from '@/features/podcasts/components/player-controls';
import { PlayerHeader } from '@/features/podcasts/components/player-header';
import { PlayerSheets } from '@/features/podcasts/components/player-sheets';
import { PlayerTitle } from '@/features/podcasts/components/player-title';
import { UpNextTool } from '@/features/podcasts/components/up-next-tool';
import { useEpisodeActions } from '@/features/podcasts/hooks/use-episode-actions';
import { useEpisodeHighlights } from '@/features/podcasts/hooks/use-episode-highlights';
import { useEpisodePlayerActions } from '@/features/podcasts/hooks/use-episode-player-actions';
import { usePlayerControls } from '@/features/podcasts/hooks/use-player-controls';
import { usePlayerScreen } from '@/features/podcasts/hooks/use-player-screen';
import { formatDuration } from '@/features/podcasts/utils/format';

/**
 * The full player for an episode. A container: its hooks re-render this and
 * not the shell around it.
 *
 * Top to bottom, in the order a listener's eye asks: what is this (artwork,
 * title, show), where am I in it (chapter, scrubber), and what can I do (the
 * transport, then one quiet row: speed, sleep, the transcript, Samwell and
 * Up Next). Nothing else.
 */
export function EpisodePlayer({ landed }: { landed: boolean }) {
  const { width, height } = useWindowDimensions();
  const player = usePlayerScreen(landed);
  const controls = usePlayerControls(player);
  const actions = useEpisodePlayerActions(player.current, player.episode, controls.closeSheet);
  const { current, episode } = player;
  const highlights = useEpisodeHighlights({ episodeId: current?.episodeId ?? null, title: current?.title ?? '' });
  const episodeActions = useEpisodeActions({ onHighlights: highlights.count > 0 ? highlights.open : undefined });

  if (!current) return null;
  // Big, but leaving the controls their room on a short phone.
  const art = Math.min(width - 48, height * 0.42, 380);
  const openMenu = episode ? () => episodeActions.openMenu(episode) : undefined;
  const transcriptLine = [current.showTitle, formatDuration(current.durationSec)].filter(Boolean).join(' · ');

  return (
    <>
      <PlayerHeader onClose={controls.close} onMenu={openMenu} />
      <View className="flex-1 justify-evenly px-6" style={contentColumn}>
        <View className="items-center">
          <PlayerArtwork uri={current.artworkUrl} size={art} playing={player.isPlaying} />
        </View>
        <PlayerTitle
          title={current.title}
          subtitle={current.showTitle}
          onSubtitle={actions.openShow}
          subtitleLabel={`Go to ${current.showTitle}`}
          favorite={actions.favorite}
          onToggleFavorite={actions.toggleFavorite}
        />
        {/* Drawn from the first frame, with the values they will keep, so
            nothing is swapped when the player lands: only the scrubber's
            drag waits for that. */}
        <PlayerControls
          player={player}
          controls={controls}
          chapterTitle={player.currentChapter?.title ?? null}
          hasChapters={player.chapters.length > 0}
          live={landed}
          tools={
            <>
              <EpisodeTranscriptBar episode={episode} line={transcriptLine} live={landed} tools />
              <UpNextTool count={player.queue.length} onPress={controls.open('upnext')} />
            </>
          }
        />
      </View>
      {landed ? (
        <>
          <PlayerSheets player={player} controls={controls} actions={actions} />
          <EpisodeActionSheet {...episodeActions.sheet} />
          <EpisodeHighlightsSheet highlights={highlights} />
        </>
      ) : null}
    </>
  );
}
