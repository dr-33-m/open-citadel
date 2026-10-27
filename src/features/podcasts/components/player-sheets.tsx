import React from 'react';

import { ChaptersSheet } from '@/features/podcasts/components/chapters-sheet';
import { SleepSheet } from '@/features/podcasts/components/sleep-sheet';
import { SpeedSheet } from '@/features/podcasts/components/speed-sheet';
import { UpNextSheet } from '@/features/podcasts/components/up-next-sheet';
import type { EpisodePlayerActions } from '@/features/podcasts/hooks/use-episode-player-actions';
import type { PlayerControls } from '@/features/podcasts/hooks/use-player-controls';
import type { usePlayerScreen } from '@/features/podcasts/hooks/use-player-screen';

type PlayerSheetsProps = {
  player: ReturnType<typeof usePlayerScreen>;
  controls: PlayerControls;
  actions: EpisodePlayerActions;
};

/** An episode's player's four sheets: speed, sleep, Up Next and chapters. */
export function PlayerSheets({ player, controls, actions }: PlayerSheetsProps) {
  const { sheet, closeSheet } = controls;
  const { upNext } = actions;
  return (
    <>
      <SpeedSheet visible={sheet === 'speed'} speed={player.speed} line={player.speedLine} onClose={closeSheet} onChange={controls.setSpeed} />
      <SleepSheet visible={sheet === 'sleep'} current={controls.sleepChoice} onClose={closeSheet} onChange={controls.setSleep} />
      <UpNextSheet
        visible={sheet === 'upnext'}
        episodes={player.queue}
        onClose={closeSheet}
        onPlay={upNext.play}
        onMove={upNext.move}
        onRemove={upNext.remove}
        onClear={upNext.clear}
      />
      <ChaptersSheet
        visible={sheet === 'chapters'}
        chapters={player.chapters}
        currentId={player.currentChapter?.id ?? null}
        onClose={closeSheet}
        onSelect={controls.seek}
      />
    </>
  );
}
