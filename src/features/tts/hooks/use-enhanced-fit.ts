import { useCallback, useMemo, useState } from 'react';

import type { EnhancedFitMarkProps } from '@/features/tts/components/enhanced-fit-mark';
import { enhancedFit, enhancedFitCopy, smootherBox } from '@/features/tts/utils/enhanced-fit';
import { TTS_ENGINES, type TtsEngineId } from '@/services/device-tts/catalogue';
import { deviceMemoryBytes } from '@/utils/memory-estimator';

/** What the phone has to run a voice box with. A fact about the phone, so it is read once. */
const DEVICE_MEMORY = deviceMemoryBytes();

/**
 * How this phone copes with the chosen voice box: the mark under that box's
 * line, and the sheet the mark opens.
 *
 * It is the box's to say and not the Enhanced voices' as a whole, because
 * they are far apart: the same phone can run one smoothly and strain at
 * another, and the sheet for the one that strains names the one that does not.
 */
export function useEnhancedFit(engine: TtsEngineId) {
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);

  return useMemo(() => {
    const fit = enhancedFit(DEVICE_MEMORY, engine);
    const copy = enhancedFitCopy(fit, engine, smootherBox(DEVICE_MEMORY, engine, TTS_ENGINES));
    const mark: EnhancedFitMarkProps = { fit, copy, onPress: open };
    return {
      /** Spreads onto `EnhancedFitMark`. */
      mark,
      /** Spreads onto `EnhancedFitSheet`, which also takes its ways out. */
      sheet: { visible, onClose: close, fit, copy },
      close,
    };
  }, [engine, visible, open, close]);
}
