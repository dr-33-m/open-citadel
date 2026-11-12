/**
 * EAS Observe, for the whole app: how fast it starts, how fast each screen
 * becomes usable, how long the work readers wait on takes, and what fails.
 *
 * Everything goes through here rather than through `expo-observe` directly,
 * for three reasons. What may leave the phone is decided once (`events.ts`:
 * named events, attributes that describe the app and never the reader's
 * reading). The reader can turn it off (Settings, "Share app performance"),
 * which every call must respect. And error messages are scrubbed of
 * addresses and file names before they go.
 *
 * Collection is on the phone and costs nothing; sending happens when the app
 * goes to the background, batched. Development builds collect but do not
 * send unless asked (`dispatchInDebug`).
 */
import Constants from 'expo-constants';
import { Observe, ObserveRoot } from 'expo-observe';
import Storage from 'expo-sqlite/kv-store';

import { isNotAFault, scrubMessage, severityOf, type ObserveEvent } from '@/lib/observe/events';

export { ObserveRoot };

const SHARING_KEY = 'observe-sharing';

/**
 * Route and query parameters never sent with a screen's timings: ids of what
 * the reader opened, the addresses and titles a page was opened with, a place
 * in a book. Each screen is still known by its pattern (`/reader/[id]`).
 */
const FILTERED_PARAMS = ['id', 'feedUrl', 'title', 'locator', 'url', 'q', 'query'];

/**
 * Whether the reader has chosen to send how the app performed. Off until they
 * do: App Review 5.1.1(ii) asks for consent before usage data is collected,
 * even anonymous data, and Google Play for an affirmative action after a
 * disclosure. Nothing recorded while off is ever sent (`dispatchingEnabled`
 * drops it), so turning it on later sends only what comes after.
 */
export function sharingEnabled(): boolean {
  try {
    return Storage.getItemSync(SHARING_KEY) === 'on';
  } catch {
    return false;
  }
}

/**
 * The whole configuration, every time. Native `configure` replaces rather
 * than merges: a call with only `dispatchingEnabled` would put the
 * environment back to the bundle's default, stop a development build
 * sending, and drop the router integration. Sending the router integration
 * again is safe; it only switches on what is already on.
 */
function configureAll(dispatchingEnabled: boolean): void {
  const environment = String(Constants.expoConfig?.extra?.appVariant ?? 'production');
  Observe.configure({
    environment,
    dispatchingEnabled,
    // A development build sends too, under its own environment, so the
    // wiring can be seen working before a store build carries it.
    dispatchInDebug: environment === 'development',
    integrations: { 'expo-router': { filteredParams: FILTERED_PARAMS } },
  });
}

/** Turns sending on or off, at once and for the next launch. What is waiting is dropped when off. */
export function setSharing(on: boolean): void {
  void Storage.setItem(SHARING_KEY, on ? 'on' : 'off').catch(() => undefined);
  try {
    configureAll(on);
  } catch {
    // Not reached: the choice is kept and applies from the next launch.
  }
}

/**
 * Called once, at module scope in the root layout, before anything mounts:
 * the router integration cannot be turned on after a screen has.
 */
export function configureObserve(): void {
  configureAll(sharingEnabled());
}

/** Sends one named event (`events.ts`). Never throws: measuring must not break what it measures. */
export function track(event: ObserveEvent): void {
  try {
    // Observe takes no nulls: an unknown figure is left out rather than sent as nothing.
    const attributes = Object.fromEntries(
      Object.entries(event.attributes).filter(([, value]) => value !== null),
    ) as Record<string, string | number | boolean>;
    Observe.logEvent(event.name, { attributes, severity: severityOf(event) });
  } catch {
    // Not reached: nothing to do about it here.
  }
}

/**
 * A failure the app caught and recovered from (a toast was shown, a fallback
 * taken), reported with where it happened and its message scrubbed. Ordinary
 * states (offline, a refusal) are not failures and are not reported.
 */
export function reportHandled(scope: string, error: unknown): void {
  if (isNotAFault(error)) return;
  try {
    const original = error instanceof Error ? error : null;
    const reported = new Error(`${scope}: ${scrubMessage(original?.message ?? String(error))}`);
    reported.name = original?.name ?? 'Error';
    if (original?.stack) reported.stack = original.stack.replace(original.message, reported.message);
    Observe.reportError(reported);
  } catch {
    // Not reached.
  }
}

/** Facts about the setup that every event carries: which brain, which plan. Never who. */
export function setObserveContext(attributes: Record<string, string | number | boolean | null>): void {
  try {
    const clean = Object.fromEntries(Object.entries(attributes).filter(([, value]) => value !== null)) as Record<
      string,
      string | number | boolean
    >;
    Observe.setGlobalAttributes(clean);
  } catch {
    // Not reached.
  }
}

/** A stopwatch: call it to read the milliseconds since it was made. */
export function startTimer(): () => number {
  const start = performance.now();
  return () => Math.max(0, Math.round(performance.now() - start));
}
