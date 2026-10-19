/**
 * What one turn may spend before something stops it.
 *
 * Shared because both halves enforce it. The server refuses past the ceiling,
 * because a stale build of the app must not be able to opt out; the app stops
 * at the same number so an ordinary turn ends on an answer rather than on a
 * refusal. Two copies of one number is how the two would drift.
 */

/**
 * Tool calls one message may make: a backstop, not the thing that ends turns.
 *
 * Samwell's tools run on the device, so each call is a full round trip that
 * re-sends the conversation and every result so far - the cost of a turn grows
 * with the square of this number, not with it. Measured on real traffic, the
 * worst single message went round 112 times and accumulated 14.6 million
 * prompt tokens, and turns like it were 91% of all spend.
 *
 * It was twelve, and twelve cut off honest work: seven video scripts from a
 * reader's books needs more looks into the library than that, and the turn
 * stopped mid-job. What ends a runaway turn now is the app noticing him ask
 * for the same thing a third time (`tool-circling.ts` in the app), and what
 * bounds its cost is the per-message credit ceiling (`credit-turn.ts` on the
 * server), which a frontier model on a growing conversation meets long before
 * forty round trips. Forty is for the loop neither of those catches.
 *
 * The server must be at least the app's number, and is deployed first: an app
 * that stops at forty talking to a server that refuses past twelve gets the
 * refusal instead of the answer so far.
 */
export const TOOL_LOOP_CEILING = 40;

/**
 * How long a turn stays open before its count is forgotten.
 *
 * Matches the app's own inactivity timeout. A turn quiet for longer has been
 * abandoned, and the next request on that thread is a new message.
 */
export const TOOL_LOOP_WINDOW_MS = 120_000;
