import * as Haptics from 'expo-haptics';

/** Haptics are best-effort — a dev client built before this native module
 * was added, an unsupported device, or a platform quirk should never crash
 * or even log loudly for something this minor. Swallow and move on. */
async function safe(call: () => Promise<void>) {
  try {
    await call();
  } catch {
    // intentionally silent
  }
}

/**
 * Named intents instead of raw `expo-haptics` calls at every site, so the
 * mapping from "what happened" to "what it feels like" lives in one place.
 * Reserved for moments that commit or change something — not every tap.
 */
export const haptics = {
  /** Moving a selection: switching tabs, crossing a boundary. */
  select: () => void safe(() => Haptics.selectionAsync()),
  /** A light, incidental tap — toggling a chip, paging a carousel. */
  tap: () => void safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Committing something real: approving a draft, saving, sending. */
  commit: () => void safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** A destructive or terminal action: delete, reject. */
  warn: () => void safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
} as const;
