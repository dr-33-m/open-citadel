/**
 * What the OS says about the phone's network (`expo-network`).
 *
 * One of the three signals in `connection-state.ts`, and the only one that can
 * be wrong without anything noticing: on Android the module debounces
 * "available" by 250ms and a "lost" in that window cancels it, so a quick
 * Wi-Fi to mobile hand-over can end on "disconnected" while the phone is
 * online. That is why it is read again rather than trusted forever.
 */

type NetworkModule = typeof import('expo-network');
let networkModule: NetworkModule | null | undefined;

/** The module, or null in a dev build made before `expo-network` was added. */
function network(): NetworkModule | null {
  if (networkModule !== undefined) return networkModule;
  try {
    // The currently installed dev build may predate expo-network. Without it
    // the app carries on as it always did, assuming it is online.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    networkModule = require('expo-network') as NetworkModule;
  } catch {
    networkModule = null;
  }
  return networkModule;
}

/**
 * Calls `onChange` with whether the OS reports a network, on every change.
 *
 * "Connected" is having a network, not having reached the internet through it:
 * `isInternetReachable` is a probe that lags and can be wrong behind a captive
 * portal either way. Reachability is the ping's job (`probe.ts`).
 */
export function listenToOsNetwork(onChange: (hasNetwork: boolean) => void): () => void {
  const module = network();
  if (!module) return () => undefined;
  const subscription = module.addNetworkStateListener((state) => onChange(state.isConnected !== false));
  return () => subscription.remove();
}

/** Asks the OS now. True when it cannot say, which is how the app always behaved. */
export async function readOsNetwork(): Promise<boolean> {
  const module = network();
  if (!module) return true;
  try {
    const state = await module.getNetworkStateAsync();
    return state.isConnected !== false;
  } catch {
    // It can reject on some platforms; the listener still reports changes.
    return true;
  }
}
