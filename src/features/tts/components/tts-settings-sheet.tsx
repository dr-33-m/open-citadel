import React from 'react';

import { PageFade } from '@/components/scroll-fades';
import { TtsSettingsPanel } from '@/features/tts/components/tts-settings-panel';
import { Sheet } from '@/components/ui/sheet';

export interface TtsSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Rising over another sheet (the Listen sheet), which stays beneath it. */
  nested?: boolean;
  /** Only the cloud's voices: opened for a book being heard (`TtsSettingsPanel`). */
  cloudOnly?: boolean;
}

/**
 * The reading voice's drawer: `TtsSettingsPanel` in a sheet. The one voice
 * sheet: the reader opens it, and so do the audiobook's player and its
 * Listen sheet, since a book is heard in the reader's cloud voice.
 *
 * Sized to the panel rather than a fixed detent. A fixed half-height squeezed
 * the mode cards and the carousel to fit and cut the speed control off. It
 * only scrolls where the panel is taller than the screen allows.
 */
export function TtsSettingsSheet({ visible, onClose, nested = false, cloudOnly = false }: TtsSettingsSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.9} scrollable stackBehavior={nested ? 'push' : undefined}>
      <PageFade edges="both" surface="popover">
        <Sheet.ScrollView contentContainerClassName="px-6 pb-6 pt-2">
          <TtsSettingsPanel onDone={onClose} surface="popover" cloudOnly={cloudOnly} />
        </Sheet.ScrollView>
      </PageFade>
    </Sheet>
  );
}
