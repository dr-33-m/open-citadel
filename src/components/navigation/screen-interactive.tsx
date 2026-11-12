import { useInteractiveWhen } from '@/hooks/use-screen-interactive';

/**
 * Marks the screen it sits in as interactive once `when` turns true, and
 * draws nothing. A component rather than the hook where the screen is heavy
 * (the Library, the reader): the marker reads the screen's route, and as its
 * own node it is the only thing that re-renders if that changes.
 */
export function ScreenInteractive({ when }: { when: boolean }) {
  useInteractiveWhen(when);
  return null;
}
