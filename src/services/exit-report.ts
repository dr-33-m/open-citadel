/**
 * Why the app last died, sent to EAS Observe on the next launch.
 *
 * Observe has no crash reporting, and the deaths that hurt most here are not
 * JavaScript errors at all: Android ending the app for memory while a brain
 * is loaded, a native crash, a freeze (ANR). Android records each one
 * (`ApplicationExitInfo`, read by `lib/exit-info`), so each launch sends the
 * ones it has not sent before. Closing the app on purpose is left out.
 * Android only; elsewhere there is nothing to read.
 */
import Storage from 'expo-sqlite/kv-store';

import { lastExits } from '@/lib/exit-info';
import { track } from '@/lib/observe';
import { exitCause } from '@/services/device-llm/exit-verdict';

const KEY = 'observe-exits-sent-until';
const MB = 1024 * 1024;

export function reportPreviousExits(): void {
  const exits = lastExits(8);
  if (!exits || exits.length === 0) return;
  const since = Number(Storage.getItemSync(KEY) ?? 0) || 0;
  let newest = since;
  for (const exit of exits) {
    if (exit.timestamp <= since) continue;
    newest = Math.max(newest, exit.timestamp);
    const cause = exitCause(exit);
    if (cause !== 'memory' && cause !== 'fault') continue;
    track({
      name: 'app.previous_exit',
      attributes: { cause, reason: exit.reason, status: exit.status, pssMb: Math.round(exit.pssBytes / MB) },
    });
  }
  if (newest > since) void Storage.setItem(KEY, String(newest)).catch(() => undefined);
}
