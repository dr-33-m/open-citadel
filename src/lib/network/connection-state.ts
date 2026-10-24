/**
 * Whether the app should behave as offline, decided from three signals rather
 * than one.
 *
 * It used to be one: the OS's network event. That event can be missed (on
 * Android, expo-network debounces "available" and lets a "lost" cancel it), and
 * nothing ever asked again, so a phone that had come back online stayed
 * "offline" until the app was closed. The model here is Expensify's
 * (`NETWORK_STATE_DETECTION.md` in Expensify/App), whose rule is that request
 * outcomes are the authority:
 *
 *  - No network at all (airplane mode, Wi-Fi off) is offline, at once.
 *  - A ping to Samwell Cloud that failed is offline until one gets through.
 *  - Requests failing in a row is offline, but only three of them across at
 *    least ten seconds, so one dropped request on a train is not.
 *
 * And any answer from the server clears all three, the OS's answer included:
 * a response is proof a stale "no network" cannot argue with.
 *
 * Pure, so the rules can be tested; `index.ts` holds the one live copy.
 */

/** Failures in a row before they count as being offline... */
export const SUSTAINED_FAILURE_COUNT = 3;
/** ...and the least time they must span, so a burst of one blip is not. */
export const SUSTAINED_FAILURE_WINDOW_MS = 10_000;

export type ConnectionState = {
  /** The OS reports a network to use. */
  hasNetwork: boolean;
  /** The last ping failed and nothing has reached the server since. */
  unreachable: boolean;
  /** Requests that failed since the last one that got an answer. */
  failures: number;
  firstFailureAt: number;
  /** Enough failures, for long enough, to call it offline. */
  sustainedFailures: boolean;
};

export const INITIAL_CONNECTION: ConnectionState = {
  hasNetwork: true,
  unreachable: false,
  failures: 0,
  firstFailureAt: 0,
  sustainedFailures: false,
};

export function isOffline(state: ConnectionState): boolean {
  return !state.hasNetwork || state.unreachable || state.sustainedFailures;
}

/** What the OS says. Only ever adds "no network"; it never clears the others. */
export function withNetwork(state: ConnectionState, hasNetwork: boolean): ConnectionState {
  return state.hasNetwork === hasNetwork ? state : { ...state, hasNetwork };
}

/** The server answered: whatever said otherwise was wrong or is over. */
export function withReached(state: ConnectionState): ConnectionState {
  if (!isOffline(state) && state.failures === 0) return state;
  return INITIAL_CONNECTION;
}

/** The ping did not get through. */
export function withPingFailed(state: ConnectionState): ConnectionState {
  return state.unreachable ? state : { ...state, unreachable: true };
}

/** A request got no answer: counted, and offline once it is sustained. */
export function withRequestFailed(state: ConnectionState, now: number): ConnectionState {
  const firstFailureAt = state.failures === 0 ? now : state.firstFailureAt;
  const failures = state.failures + 1;
  const sustainedFailures =
    state.sustainedFailures ||
    (failures >= SUSTAINED_FAILURE_COUNT && now - firstFailureAt >= SUSTAINED_FAILURE_WINDOW_MS);
  return { ...state, failures, firstFailureAt, sustainedFailures };
}

/** Why the app is offline, for the log. Null when it is not. */
export function offlineReason(state: ConnectionState): string | null {
  if (!state.hasNetwork) return 'the phone reports no network';
  if (state.unreachable) return 'the ping to Samwell Cloud failed';
  if (state.sustainedFailures) return `${state.failures} requests failed in a row`;
  return null;
}
