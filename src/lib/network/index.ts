/**
 * Whether the app is online, and being told when that changes.
 *
 * One place, so the query cache and anything that wants to say "you are
 * offline" read the same answer. See `connection-state.ts` for how the answer
 * is decided, `query-client.ts` for what the cache does with it and
 * `hooks/use-online.ts` for reading it in a component.
 *
 * The part that fixes "the app thinks it is offline until it is restarted":
 * while offline it keeps asking, every few seconds and whenever the app comes
 * back to the front, and the first answer from the server ends it.
 */
import { AppState } from 'react-native';

import {
  INITIAL_CONNECTION,
  isOffline,
  offlineReason,
  withNetwork,
  withPingFailed,
  withReached,
  withRequestFailed,
  type ConnectionState,
} from './connection-state';
import { installDevSwitches } from './dev-switches';
import { listenToOsNetwork, readOsNetwork } from './os-network';
import { canPing, pingCloud } from './probe';
import { reportCloudFetches } from './report-fetch';

/** How often to ask again while offline. Expensify's interval. */
const OFFLINE_RECHECK_MS = 5_000;

let state: ConnectionState = INITIAL_CONNECTION;
// The developer menu's "force offline" and "flaky". See `dev-switches.ts`.
let simulatedOffline = false;
const watchers = new Set<(online: boolean) => void>();
let started = false;
let recheckTimer: ReturnType<typeof setTimeout> | null = null;
let checking = false;

function offlineNow(): boolean {
  return simulatedOffline || isOffline(state);
}

function update(next: ConnectionState, simulated: boolean = simulatedOffline): void {
  const wasOffline = offlineNow();
  state = next;
  simulatedOffline = simulated;
  const offline = offlineNow();
  if (offline !== wasOffline) {
    const reason = simulatedOffline ? 'simulated from the developer menu' : offlineReason(state);
    // A warning so it survives into release builds' logcat, where the
    // question "why did it think it was offline" actually gets asked.
    console.warn(offline ? `[Network] Offline: ${reason}.` : '[Network] Back online.');
    for (const watcher of watchers) watcher(!offline);
  }
  scheduleRecheck();
}

function scheduleRecheck(): void {
  if (!isOffline(state)) {
    if (recheckTimer) clearTimeout(recheckTimer);
    recheckTimer = null;
    return;
  }
  if (recheckTimer || checking) return;
  recheckTimer = setTimeout(() => {
    recheckTimer = null;
    void recheckConnection();
  }, OFFLINE_RECHECK_MS);
}

/**
 * Ask again now: the OS, then the server.
 *
 * Only the server can say "online" once something has said otherwise, which is
 * the point: the OS's answer is the one that went stale.
 */
export async function recheckConnection(): Promise<void> {
  if (checking) return;
  checking = true;
  try {
    update(withNetwork(state, await readOsNetwork()));
    if (!canPing()) return;
    update((await pingCloud()) ? withReached(state) : withPingFailed(state));
  } finally {
    checking = false;
    scheduleRecheck();
  }
}

/** A request to Samwell Cloud got an answer. */
export function reportCloudReached(): void {
  update(withReached(state));
}

/** A request to Samwell Cloud got no answer at all. */
export function reportCloudUnreached(): void {
  update(withRequestFailed(state, Date.now()));
}

function start(): void {
  if (started) return;
  started = true;
  reportCloudFetches({ onReached: reportCloudReached, onUnreached: reportCloudUnreached });
  installDevSwitches((offline) => update(state, offline));
  listenToOsNetwork((hasNetwork) => {
    update(withNetwork(state, hasNetwork));
    // A network that has just come back is when the server is worth asking.
    if (hasNetwork && isOffline(state)) void recheckConnection();
  });
  AppState.addEventListener('change', (appState) => {
    if (appState === 'active' && isOffline(state)) void recheckConnection();
  });
  void readOsNetwork().then((hasNetwork) => update(withNetwork(state, hasNetwork)));
}

/** Whether the app is online right now. */
export function isConnected(): boolean {
  return !offlineNow();
}

/**
 * Calls `onChange` with whether the app is online: once with the answer now,
 * then on every change. Returns the way to stop.
 */
export function watchConnection(onChange: (online: boolean) => void): () => void {
  start();
  watchers.add(onChange);
  onChange(isConnected());
  return () => {
    watchers.delete(onChange);
  };
}

/**
 * Resolves true once the app is online, or false when `timeoutMs` passes or
 * `signal` aborts first. Asks again straight away rather than waiting for the
 * next scheduled check, since whoever is waiting has work to resume.
 */
export function waitForConnection({ timeoutMs, signal }: { timeoutMs: number; signal?: AbortSignal }): Promise<boolean> {
  start();
  if (isConnected()) return Promise.resolve(true);
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const finish = (online: boolean) => {
      clearTimeout(timer);
      watchers.delete(onChange);
      signal?.removeEventListener('abort', onAbort);
      resolve(online);
    };
    const onChange = (online: boolean) => {
      if (online) finish(true);
    };
    const onAbort = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);
    watchers.add(onChange);
    signal?.addEventListener('abort', onAbort, { once: true });
    void recheckConnection();
  });
}
