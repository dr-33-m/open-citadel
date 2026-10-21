import React from 'react';

import { InfoSheet } from '@/components/info-sheet';
import { ListenSheet } from '@/features/audiobook/components/listen-sheet';
import type { ListenState } from '@/features/audiobook/hooks/use-listen';
import { PlansSheet } from '@/features/billing/components/plans-sheet';
import { TtsSettingsSheet } from '@/features/tts/components/tts-settings-sheet';

/**
 * Everything Listen can raise: the Listen sheet, the reader's voice sheet
 * over it, how it is paid for, and the plans where there is none.
 */
export function ListenSheets({ listen }: { listen: ListenState }) {
  return (
    <>
      <ListenSheet sheet={listen.sheet} />
      <TtsSettingsSheet {...listen.voice} nested />
      <InfoSheet {...listen.info} />
      <PlansSheet {...listen.plans} />
    </>
  );
}
