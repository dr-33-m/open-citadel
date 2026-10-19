import React from 'react';
import { View } from 'react-native';

import { PlayerOptions } from '@/features/podcasts/components/player-options';
import { PlayerProgress } from '@/features/podcasts/components/player-progress';
import { PlayerTransport } from '@/features/podcasts/components/player-transport';
import type { PlayerControls as Controls } from '@/features/podcasts/hooks/use-player-controls';
import type { usePlayerScreen } from '@/features/podcasts/hooks/use-player-screen';

type PlayerControlsProps = {
  player: ReturnType<typeof usePlayerScreen>;
  controls: Controls;
  /**
   * False while the player is still opening. The controls are drawn from the
   * first frame, as they will stay: only the scrubber's drag waits for the
   * player to land, since that is a behaviour, not something drawn, and
   * turning it on changes no pixel.
   */
  live: boolean;
  /** Under the options: the episode's Transcript and Ask Samwell boxes. */
  transcript?: React.ReactNode;
};

/**
 * Where the listener is and what they can do: the scrubber, the transport,
 * then speed, sleep, Up Next and chapters, then the transcript and Samwell.
 */
export function PlayerControls({ player, controls, live, transcript }: PlayerControlsProps) {
  return (
    <View className="gap-8">
      <PlayerProgress
        chapterTitle={player.currentChapter?.title ?? null}
        position={player.clock.position}
        duration={player.clock.duration}
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
      <View className="gap-3">
        <PlayerOptions
          speedLabel={player.speedLabel}
          sleepLabel={player.sleepLabel}
          upNextCount={player.queue.length}
          hasChapters={player.chapters.length > 0}
          onSpeed={controls.open('speed')}
          onSleep={controls.open('sleep')}
          onUpNext={controls.open('upnext')}
          onChapters={controls.open('chapters')}
        />
        {transcript}
      </View>
    </View>
  );
}
