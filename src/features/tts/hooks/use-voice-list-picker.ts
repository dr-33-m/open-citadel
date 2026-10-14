import { useCallback, useEffect, useRef, useState } from 'react';

import { useOnScreen } from '@/components/kept-alive';
import type { DeviceVoice } from '@/utils/device-voices';

/**
 * Opening the voice list, choosing from it and trying a voice in it: the
 * part every kind of voice does the same way (the phone's own, the Enhanced
 * ones, a cloud voice box's). What differs between them is only what a
 * sample is and what a choice saves, which the caller hands in.
 *
 * One copy of three decisions that had drifted apart between the pickers:
 *
 * - The speaker on the voice that is playing stops it; on any other, it
 *   plays that one. Read through a ref so `sheet.onPreview` keeps one
 *   identity: the rows are memoised on it, and a handler remade each time a
 *   sample started or ended redrew every row in the list for a change that
 *   concerns one.
 * - Closing the list stops the sample.
 * - So does the pane being put away rather than removed (`KeptAlive`): a
 *   sample must not play on under whatever took its place.
 *
 * `start`, `stop` and `onPick` should each keep one identity.
 */
export function useVoiceListPicker({
  previewing,
  start,
  stop,
  onPick,
}: {
  /** The voice whose sample is playing, by identifier. */
  previewing: string | null;
  /** Play this voice's sample. */
  start: (voice: DeviceVoice) => void | Promise<void>;
  stop: () => void;
  onPick: (voice: DeviceVoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => {
    stop();
    setOpen(false);
  }, [stop]);

  const onScreen = useOnScreen();
  useEffect(() => {
    if (!onScreen) stop();
  }, [onScreen, stop]);

  const select = useCallback(
    (voice: DeviceVoice) => {
      onPick(voice);
      close();
    },
    [onPick, close],
  );

  const playing = useRef(previewing);
  useEffect(() => {
    playing.current = previewing;
  }, [previewing]);
  const preview = useCallback(
    (voice: DeviceVoice) => {
      if (playing.current === voice.identifier) stop();
      else void start(voice);
    },
    [start, stop],
  );

  return {
    open,
    show,
    /** Spread onto `VoiceListPicker`, with the rows and what is chosen. */
    sheet: { visible: open, onOpen: show, onClose: close, onSelect: select, onPreview: preview },
  };
}
