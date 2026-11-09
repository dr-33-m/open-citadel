/**
 * How a copy of the app the server no longer serves is mended: from the
 * store, or by restarting onto an update already published for it.
 */
export type GateVerdict = 'store' | 'restart';

/** The verdict in a server's answer, or none: anything unrecognised is none. */
export function readVerdict(body: unknown): GateVerdict | null {
  const update = (body as { update?: unknown } | null)?.update;
  return update === 'store' || update === 'restart' ? update : null;
}

/** What the update screen says for each verdict. */
export function gateCopy(verdict: GateVerdict) {
  if (verdict === 'restart') {
    return {
      title: 'One restart',
      line: 'A newer version of Open Citadel is ready for you.',
      action: 'RESTART NOW',
    };
  }
  return {
    title: 'Time to update',
    line: 'This version of Open Citadel has stopped working. The new one is waiting in the store.',
    action: 'UPDATE NOW',
  };
}

/**
 * Where the update is: the store app first, its web page if the store app
 * will not open (a phone without Google Play, a simulator).
 */
export function storeLinks(platform: string, androidPackage: string, iosAppId: string) {
  if (platform === 'ios') {
    return {
      app: `itms-apps://apps.apple.com/app/id${iosAppId}`,
      web: `https://apps.apple.com/app/id${iosAppId}`,
    };
  }
  return {
    app: `market://details?id=${androidPackage}`,
    web: `https://play.google.com/store/apps/details?id=${androidPackage}`,
  };
}
