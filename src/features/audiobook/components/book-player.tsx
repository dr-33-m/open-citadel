import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { BookOpen } from '@/components/icons';
import { contentColumn } from '@/constants/theme';
import { BookPlayerSheets } from '@/features/audiobook/components/book-player-sheets';
import { BookPlayerTools } from '@/features/audiobook/components/book-player-tools';
import { useBookPlayer } from '@/features/audiobook/hooks/use-book-player';
import { useBookPlayerActions } from '@/features/audiobook/hooks/use-book-player-actions';
import { PlayerArtwork } from '@/features/podcasts/components/player-artwork';
import { PlayerControls } from '@/features/podcasts/components/player-controls';
import { PlayerHeader } from '@/features/podcasts/components/player-header';
import { PlayerTitle } from '@/features/podcasts/components/player-title';
import { usePlayerControls } from '@/features/podcasts/hooks/use-player-controls';
import { monogramOf } from '@/utils/monogram';

/** A book's cover, width over height. */
const COVER = 2 / 3;

/**
 * The full player for a book heard in a cloud voice: the same player an
 * episode is drawn in, given a book. The cover, standing as a book does; the
 * title and its author; the chapter in gold over the scrubber (it opens
 * them all, as an episode's does); the whole book on the
 * scrubber with the time left in words; the transport; and the row of
 * tools, where a book's own are its text, Highlight and its voice. A
 * container: its hooks re-render this and not the shell around it.
 */
export function BookPlayer({ landed }: { landed: boolean }) {
  const { width, height } = useWindowDimensions();
  const player = useBookPlayer(landed);
  const controls = usePlayerControls(player);
  const actions = useBookPlayerActions(player.current);
  const { current } = player;

  if (!current) return null;
  // As tall as an episode's artwork, so the controls keep their place.
  const art = Math.min((width - 48) / COVER, height * 0.42, 380);

  return (
    <>
      <PlayerHeader onClose={controls.close} onMenu={controls.open('menu')} />
      <View className="flex-1 justify-evenly px-6" style={contentColumn}>
        <View className="items-center">
          <PlayerArtwork
            uri={current.coverUrl}
            size={art}
            aspect={COVER}
            playing={player.isPlaying}
            fallbackIcon={BookOpen}
            monogram={monogramOf(current.title)}
          />
        </View>
        <PlayerTitle
          title={current.title}
          subtitle={current.author ?? ''}
          favorite={player.favorite}
          onToggleFavorite={actions.toggleFavorite}
        />
        <PlayerControls
          player={player}
          controls={controls}
          chapterTitle={current.chapterTitle}
          hasChapters={player.chapters.length > 0}
          middleLabel={player.timeLeft}
          live={landed}
          tools={
            <BookPlayerTools
              highlighted={player.highlighted}
              onText={controls.open('text')}
              onHighlight={actions.highlight}
              onVoice={controls.open('voice')}
            />
          }
        />
      </View>
      {landed ? <BookPlayerSheets player={player} controls={controls} onMenu={actions.onMenu} /> : null}
    </>
  );
}
