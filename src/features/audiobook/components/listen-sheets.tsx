import React from 'react';

import { InfoSheet } from '@/components/info-sheet';
import { BookVoiceSheet } from '@/features/audiobook/components/book-voice-sheet';
import { ListenSheet } from '@/features/audiobook/components/listen-sheet';
import { useBookVoice } from '@/features/audiobook/hooks/use-book-voice';
import type { ListenState } from '@/features/audiobook/hooks/use-listen';
import { PlansSheet } from '@/features/billing/components/plans-sheet';

/**
 * Everything Listen can raise: the Listen sheet, the voice over it, how it
 * is paid for, and the plans where there is none. A container: the voice
 * pane's state lives here, not in the screen that offered Listen.
 */
export function ListenSheets({ listen }: { listen: ListenState }) {
  const voice = useBookVoice(listen.voice);
  return (
    <>
      <ListenSheet sheet={listen.sheet} />
      <BookVoiceSheet state={voice} nested />
      <InfoSheet {...listen.info} />
      <PlansSheet {...listen.plans} />
    </>
  );
}
