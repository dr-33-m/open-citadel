/**
 * What one turn may spend before something stops it.
 *
 * Shared because both halves enforce it. The server refuses past the ceiling,
 * because a stale build of the app must not be able to opt out; the app stops
 * at the same number so an ordinary turn ends on an answer rather than on a
 * refusal. Two copies of one number is how the two would drift.
 */

/**
 * Tool calls one message may make.
 *
 * Samwell's tools run on the device, so each call is a full round trip that
 * re-sends the conversation and every result so far - the cost of a turn grows
 * with the square of this number, not with it. Measured on real traffic, the
 * worst single message went round 112 times and accumulated 14.6 million
 * prompt tokens, and turns like it were 91% of all spend.
 *
 * Twelve is generous against what a real answer needs. The onboarding script
 * is the longest scripted run in the app and lands around fifteen requests in
 * total; ordinary reading chat is one or two. Past a dozen the model has
 * stopped making progress and started circling.
 */
export const TOOL_LOOP_CEILING = 12;

/**
 * How long a turn stays open before its count is forgotten.
 *
 * Matches the app's own inactivity timeout. A turn quiet for longer has been
 * abandoned, and the next request on that thread is a new message.
 */
export const TOOL_LOOP_WINDOW_MS = 120_000;
