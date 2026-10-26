import React from 'react';
import { View } from 'react-native';

import { PlayerOptions } from '@/features/podcasts/components/player-options';
import { PlayerProgress } from '@/features/podcasts/components/player-progress';
import { PlayerTransport } from '@/features/podcasts/components/player-transport';
import type { PlayerControls as Controls } from '@/features/podcasts/hooks/use-player-controls';
import type { PlayerState } from '@/features/podcasts/hooks/use-player-state';

type PlayerControlsProps = {
  player: PlayerState;
  controls: Controls;
  /** The chapter playing, over the scrubber; it opens the list. */
  chapterTitle: string | null;
  hasChapters: boolean;
  /** Keep the chapter line's room before a chapter is known (`PlayerProgress`). */
  chapterRoom?: boolean;
  /** Between the scrubber's two times: a book's "About 6 h 12 m left". */
  middleLabel?: string | null;
  /**
   * False while the player is still opening. The controls are drawn from the
   * first frame, as they will stay: only the scrubber's drag waits for the
   * player to land, since that is a behaviour, not something drawn, and
   * turning it on changes no pixel.
   */
  live: boolean;
  /** The kind's own tools, after speed and sleep. */
  tools?: React.ReactNode;
};

/**
 * Where the listener is and what they can do, for an episode or a book: the
 * scrubber, the transport, then one quiet row of tools.
 */
export function PlayerControls({ player, controls, chapterTitle, hasChapters, chapterRoom = false, middleLabel = null, live, tools }: PlayerControlsProps) {
  return (
    <View className="gap-8">
      <PlayerProgress
        chapterTitle={chapterTitle}
        hasChapters={hasChapters}
        chapterRoom={chapterRoom}
        position={player.clock.position}
        duration={player.clock.duration}
        middleLabel={middleLabel}
        error={player.error}
        onChapters={controls.open('chapters')}
        onSeek={controls.seek}
        live={live}
      />
      <PlayerTransport
        playing={player.isPlaying}
        buffering={player.isBuffering}
        skipBackSec={player.skipBackSec}
        skipForwardSec={player.skipForwardSec}
        onToggle={controls.toggle}
        onBack={controls.back}
        onForward={controls.forward}
      />
      <PlayerOptions
        speedLabel={player.speedLabel}
        sleepLabel={player.sleepLabel}
        onSpeed={controls.open('speed')}
        onSleep={controls.open('sleep')}
      >
        {tools}
      </PlayerOptions>
    </View>
  );
}
