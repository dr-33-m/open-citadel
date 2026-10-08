/**
 * The two limits on read-aloud that are not money.
 *
 * The balance is the real stop: a reader with no Neurons left is refused by
 * the reservation, whatever these say. These are about one account using the
 * route in a way no reader does, held in memory like `tool-loop.ts` for the
 * same reason (one process, and a restart forgetting the counts errs towards
 * letting a reader through).
 *
 *  - Two pieces in flight at once. The app keeps at most two requests open
 *    (the piece being read and the next, then the one after as a slot frees),
 *    so a third concurrent request is a client gone wrong, not a fast reader.
 *  - A daily ceiling of characters. A book read aloud end to end is about
 *    half a million characters and takes ten hours; three books' worth in a
 *    day is past what a person listens to, and well short of what a script
 *    could ask for.
 */

export const MAX_IN_FLIGHT = 2;
export const DAILY_CHARACTER_CEILING = 1_500_000;

const DAY_MS = 86_400_000;
/** Past this many accounts the day's counts are dropped rather than walked. */
const MAX_TRACKED = 10_000;

export interface SpeechGuards {
  /** Takes a slot and the day's characters, or says which limit refused. */
  admit(
    accountId: string,
    characters: number,
    nowMs?: number,
  ): { allowed: true; release: (refundCharacters?: boolean) => void } | {
    allowed: false;
    reason: 'too_many_in_flight' | 'daily_limit';
  };
}

export function createSpeechGuards(options?: {
  maxInFlight?: number;
  dailyCeiling?: number;
}): SpeechGuards {
  const maxInFlight = options?.maxInFlight ?? MAX_IN_FLIGHT;
  const ceiling = options?.dailyCeiling ?? DAILY_CHARACTER_CEILING;
  const inFlight = new Map<string, number>();
  const days = new Map<string, { day: number; characters: number }>();

  return {
    admit(accountId, characters, nowMs = Date.now()) {
      const day = Math.floor(nowMs / DAY_MS);
      if (days.size > MAX_TRACKED) {
        for (const [key, entry] of days) if (entry.day !== day) days.delete(key);
        if (days.size > MAX_TRACKED) days.clear();
      }

      if ((inFlight.get(accountId) ?? 0) >= maxInFlight) {
        return { allowed: false, reason: 'too_many_in_flight' };
      }
      const today = days.get(accountId);
      const used = today && today.day === day ? today.characters : 0;
      if (used + characters > ceiling) return { allowed: false, reason: 'daily_limit' };

      inFlight.set(accountId, (inFlight.get(accountId) ?? 0) + 1);
      days.set(accountId, { day, characters: used + characters });

      let released = false;
      return {
        allowed: true,
        /*
         * Once per admission, however many paths reach it. A piece the maker
         * never answered gives its characters back, so a bad hour at a maker
         * does not spend a reader's day.
         */
        release(refundCharacters = false) {
          if (released) return;
          released = true;
          const count = (inFlight.get(accountId) ?? 1) - 1;
          if (count <= 0) inFlight.delete(accountId);
          else inFlight.set(accountId, count);
          if (refundCharacters) {
            const entry = days.get(accountId);
            if (entry && entry.day === day) {
              entry.characters = Math.max(0, entry.characters - characters);
            }
          }
        },
      };
    },
  };
}
