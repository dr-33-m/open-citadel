import React from 'react';

import { FollowAlongMenuSheet } from '@/components/follow-along/follow-along-menu-sheet';
import { HighlightMenu } from '@/components/reader/highlight-menu';
import { BookMenuSheet } from '@/features/audiobook/components/book-menu-sheet';
import { BookTextSheet } from '@/features/audiobook/components/book-text-sheet';
import { BookVoiceSheet } from '@/features/audiobook/components/book-voice-sheet';
import { useBookText } from '@/features/audiobook/hooks/use-book-text';
import { useBookVoice } from '@/features/audiobook/hooks/use-book-voice';
import type { BookPlayerState } from '@/features/audiobook/hooks/use-book-player';
import type { BookPlayerAction } from '@/features/audiobook/utils/player-menu';
import { ChaptersSheet } from '@/features/podcasts/components/chapters-sheet';
import { SleepSheet } from '@/features/podcasts/components/sleep-sheet';
import { SpeedSheet } from '@/features/podcasts/components/speed-sheet';
import type { PlayerControls } from '@/features/podcasts/hooks/use-player-controls';
import { BOOK_SLEEP_CHOICES } from '@/features/podcasts/utils/setting-choices';

type BookPlayerSheetsProps = {
  player: BookPlayerState;
  controls: PlayerControls;
  onMenu: (action: BookPlayerAction) => void;
};

/**
 * A book's player's sheets: speed, sleep (to the end of the chapter),
 * chapters, the text read along, the voice, and the menu. A container: the
 * text and the voice keep their own state, which re-renders this and not the
 * player.
 */
export function BookPlayerSheets({ player, controls, onMenu }: BookPlayerSheetsProps) {
  const { sheet, closeSheet } = controls;
  const text = useBookText(sheet === 'text');
  const voice = useBookVoice({ visible: sheet === 'voice', onClose: closeSheet });
  return (
    <>
      <SpeedSheet visible={sheet === 'speed'} speed={player.speed} line={player.speedLine} onClose={closeSheet} onChange={controls.setSpeed} />
      <SleepSheet
        visible={sheet === 'sleep'}
        current={controls.sleepChoice}
        choices={BOOK_SLEEP_CHOICES}
        onClose={closeSheet}
        onChange={controls.setSleep}
      />
      <ChaptersSheet
        visible={sheet === 'chapters'}
        chapters={player.chapters}
        currentId={player.currentChapterId}
        onClose={closeSheet}
        onSelect={controls.seek}
      />
      <BookTextSheet visible={sheet === 'text'} onClose={closeSheet} state={text} />
      <FollowAlongMenuSheet {...text.menu} />
      {text.editor ? <HighlightMenu {...text.editor} /> : null}
      <BookVoiceSheet state={voice} />
      <BookMenuSheet visible={sheet === 'menu'} title={player.current?.title ?? ''} onClose={closeSheet} onSelect={onMenu} />
    </>
  );
}
