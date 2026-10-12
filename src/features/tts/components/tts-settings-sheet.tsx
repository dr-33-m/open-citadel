import React from 'react';

import { PageFade } from '@/components/scroll-fades';
import { TtsSettingsPanel } from '@/features/tts/components/tts-settings-panel';
import { Sheet } from '@/components/ui/sheet';

export interface TtsSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * The reading voice's drawer: `TtsSettingsPanel` in a sheet.
 *
 * Sized to the panel rather than a fixed detent. A fixed half-height squeezed
 * the mode cards and the carousel to fit and cut the speed control off. It
 * only scrolls where the panel is taller than the screen allows.
 */
export function TtsSettingsSheet({ visible, onClose }: TtsSettingsSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.9} scrollable>
      <PageFade edges="both" surface="popover">
        <Sheet.ScrollView contentContainerClassName="px-6 pb-6 pt-2">
          <TtsSettingsPanel onDone={onClose} surface="popover" />
        </Sheet.ScrollView>
      </PageFade>
    </Sheet>
  );
}
