import { describe, expect, it } from 'vitest';

import {
  INITIAL_CONNECTION,
  isOffline,
  offlineReason,
  SUSTAINED_FAILURE_WINDOW_MS,
  withNetwork,
  withPingFailed,
  withReached,
  withRequestFailed,
} from '../connection-state';

describe('connection state', () => {
  it('starts online', () => {
    expect(isOffline(INITIAL_CONNECTION)).toBe(false);
    expect(offlineReason(INITIAL_CONNECTION)).toBeNull();
  });

  it('is offline at once when the phone has no network', () => {
    const state = withNetwork(INITIAL_CONNECTION, false);
    expect(isOffline(state)).toBe(true);
    expect(offlineReason(state)).toMatch(/no network/);
  });

  it('is offline when the ping fails', () => {
    expect(isOffline(withPingFailed(INITIAL_CONNECTION))).toBe(true);
  });

  it('does not call a quick burst of failures offline', () => {
    let state = INITIAL_CONNECTION;
    for (let i = 0; i < 5; i += 1) state = withRequestFailed(state, 1_000 + i * 100);
    expect(isOffline(state)).toBe(false);
  });

  it('calls three failures across ten seconds offline', () => {
    let state = withRequestFailed(INITIAL_CONNECTION, 0);
    state = withRequestFailed(state, 4_000);
    expect(isOffline(state)).toBe(false);
    state = withRequestFailed(state, SUSTAINED_FAILURE_WINDOW_MS);
    expect(isOffline(state)).toBe(true);
    expect(offlineReason(state)).toMatch(/3 requests failed/);
  });

  it('needs three failures, however long apart', () => {
    let state = withRequestFailed(INITIAL_CONNECTION, 0);
    state = withRequestFailed(state, 60_000);
    expect(isOffline(state)).toBe(false);
  });

  it('clears everything once the server answers, a stale "no network" included', () => {
    let state = withNetwork(INITIAL_CONNECTION, false);
    state = withPingFailed(state);
    state = withRequestFailed(withRequestFailed(withRequestFailed(state, 0), 5_000), 10_000);
    expect(isOffline(state)).toBe(true);
    expect(withReached(state)).toEqual(INITIAL_CONNECTION);
  });

  it('forgets failures once a request gets through', () => {
    const state = withReached(withRequestFailed(withRequestFailed(INITIAL_CONNECTION, 0), 1_000));
    expect(state.failures).toBe(0);
  });

  it('keeps the same object when nothing changes', () => {
    expect(withNetwork(INITIAL_CONNECTION, true)).toBe(INITIAL_CONNECTION);
    expect(withReached(INITIAL_CONNECTION)).toBe(INITIAL_CONNECTION);
  });
});
