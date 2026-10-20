import { DevSettings } from 'react-native';

/**
 * Two entries in the developer menu (shake, or `d` in Metro), development
 * builds only: force the app offline, or make it flaky, going offline and back
 * every two to five seconds. Expensify keeps the same pair in its test menu,
 * because offline behaviour that is only ever tried by walking into a lift
 * does not get tried.
 *
 * They change what the app believes, not the network: requests still go out.
 * What they exercise is everything that reads the answer (the query cache,
 * "you are offline" in the chats, the cloud voices' failure sheet).
 */
export function installDevSwitches(setSimulatedOffline: (offline: boolean) => void): void {
  if (!__DEV__) return;
  let forced = false;
  let flakyTimer: ReturnType<typeof setTimeout> | null = null;

  const stopFlaky = () => {
    if (flakyTimer) clearTimeout(flakyTimer);
    flakyTimer = null;
  };
  const flip = () => {
    setSimulatedOffline(Math.random() < 0.5);
    flakyTimer = setTimeout(flip, 2_000 + Math.random() * 3_000);
  };

  DevSettings.addMenuItem('Network: force offline (toggle)', () => {
    stopFlaky();
    forced = !forced;
    setSimulatedOffline(forced);
  });
  DevSettings.addMenuItem('Network: flaky connection (toggle)', () => {
    forced = false;
    if (flakyTimer) {
      stopFlaky();
      setSimulatedOffline(false);
    } else {
      flip();
    }
  });
}
