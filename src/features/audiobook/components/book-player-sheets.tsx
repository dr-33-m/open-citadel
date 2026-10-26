import React from 'react';

import { FollowAlongMenuSheet } from '@/components/follow-along/follow-along-menu-sheet';
import { HighlightMenu } from '@/components/reader/highlight-menu';
import { BookMenuSheet } from '@/features/audiobook/components/book-menu-sheet';
import { BookTextSheet } from '@/features/audiobook/components/book-text-sheet';
import { useBookText } from '@/features/audiobook/hooks/use-book-text';
import type { BookPlayerState } from '@/features/audiobook/hooks/use-book-player';
import type { BookPlayerAction } from '@/features/audiobook/utils/player-menu';
import { ChaptersSheet } from '@/features/podcasts/components/chapters-sheet';
import { SleepSheet } from '@/features/podcasts/components/sleep-sheet';
import { SpeedSheet } from '@/features/podcasts/components/speed-sheet';
import type { PlayerControls } from '@/features/podcasts/hooks/use-player-controls';
import { BOOK_SLEEP_CHOICES } from '@/features/podcasts/utils/setting-choices';
import { TtsSettingsSheet } from '@/features/tts/components/tts-settings-sheet';
import { followBookVoice } from '@/services/audiobook';

type BookPlayerSheetsProps = {
  player: BookPlayerState;
  controls: PlayerControls;
  onMenu: (action: BookPlayerAction) => void;
};

/**
 * A book's player's sheets: speed, sleep (to the end of the chapter),
 * chapters, the text read along, the voice (the reader's own sheet), and the
 * menu. A container: the text keeps its own state, which re-renders this and
 * not the player.
 */
export function BookPlayerSheets({ player, controls, onMenu }: BookPlayerSheetsProps) {
  const { sheet, closeSheet } = controls;
  const text = useBookText(sheet === 'text');
  // The reader's voice sheet. Browsing voices costs nothing: the book carries
  // on in the chosen one once it closes, from the sentence being heard.
  const closeVoice = () => {
    closeSheet();
    void followBookVoice();
  };
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
      <TtsSettingsSheet visible={sheet === 'voice'} onClose={closeVoice} cloudOnly />
      <BookMenuSheet visible={sheet === 'menu'} title={player.current?.title ?? ''} post={player.current?.post ?? false} onClose={closeSheet} onSelect={onMenu} />
    </>
  );
}
