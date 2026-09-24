import { dismissToast, showToast } from '@/components/toast/toast-provider';

/**
 * Work the model does that nobody asked for just now: naming a chat the
 * reader has left.
 *
 * Nothing should cut it off halfway or run over it unannounced. Putting the
 * model to sleep used to tear it down mid-title, which threw, and a message
 * sent meanwhile silently waited behind it. So anything that needs the model
 * to itself waits for the errand here, and the reader is told what the wait
 * is while it lasts.
 */

let running: { done: Promise<void>; notice: string } | null = null;

const TOAST_KEY = 'model-errand';

/**
 * Runs `work` as the model's errand. One at a time: the caller checks
 * `errandRunning` first.
 *
 * @param notice What the reader is told if they have to wait for it.
 */
export function runErrand(notice: string, work: () => Promise<void>): Promise<void> {
  const errand = { notice, done: Promise.resolve() };
  errand.done = work().finally(() => {
    if (running === errand) running = null;
  });
  running = errand;
  return errand.done;
}

export function errandRunning(): boolean {
  return running !== null;
}

/**
 * Resolves once the errand in flight has finished, saying what it is in a
 * toast with a spinner for as long as that takes. Resolves at once, and says
 * nothing, when there is none.
 */
export async function afterErrand(): Promise<void> {
  const current = running;
  if (!current) return;
  showToast({ key: TOAST_KEY, message: current.notice, busy: true });
  try {
    await current.done.catch(() => undefined);
  } finally {
    dismissToast(TOAST_KEY);
  }
}
