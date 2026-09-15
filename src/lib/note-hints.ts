/**
 * Why writing a note here is worth the thirty seconds.
 *
 * Every field in the app that asks for one used to ask silently, or with a
 * placeholder standing in for a reason. That is the one thing a prompt cannot
 * leave out: people skip optional writing not because it is hard but because
 * nothing has told them what it buys, and these particular notes buy the thing
 * the whole app is for. Samwell reads them. Without them he has the record of
 * what happened and none of why, which is the difference between advice about
 * a number and advice about a person.
 *
 * So each line does the same two jobs, in the same order:
 *
 *   1. Name exactly what Samwell CANNOT see without it. Concrete, not
 *      "helps him understand you better", which is a claim with nothing under
 *      it and reads as an app flattering itself.
 *   2. Say what he does with it.
 *
 * Kept together so the four read as one voice rather than four writers, and
 * short enough to sit under a field as a label. Plain English, no em dashes,
 * and Samwell is "he".
 */
export const NOTE_HINTS = {
  /** Under the note field on a day's log, where the note is optional. */
  log: 'He can see what you logged, but not why. A note is what turns your numbers into advice that fits you.',

  /** Under the note field on a highlight. */
  highlight:
    'He can see the line you kept, but not what it meant to you. Your note is what he builds on later.',

  /** Under the body of a new thought. */
  thought:
    'Samwell reads these in your own words. The clearer you are here, the better he knows what is on your mind.',

  /** Under the reason field when a goal is being stopped early. */
  goalStopped:
    'Samwell keeps this. It is what stops him planning the same wrong thing for you next time.',
} as const;
