import { Hono, type MiddlewareHandler } from 'hono';

/**
 * Which copies of the app the server still serves.
 *
 * Two ways a copy can be too old, and each is mended differently, so the
 * verdict says which:
 *
 * - `store`: the binary is older than the oldest one supported. Only the
 *   App Store or Google Play can replace it.
 * - `restart`: the binary is fine but the JavaScript running in it predates
 *   a change the server has since made. An over-the-air update is already
 *   published for it, and a restart picks it up.
 *
 * A request that does not say which copy sent it is served as before. Every
 * install from before this gate is one of those, and none of them can draw a
 * screen asking to be updated, so turning them away would only break them.
 */
export type GateVerdict = 'store' | 'restart' | null;

export type GateConfig = {
  /** The oldest build each platform still runs on: its versionCode or build number. */
  minBuild: { android: number; ios: number };
  /** JavaScript published before this is asked to restart onto the newer update. */
  minReleasedAt: number | null;
};

export type AppIdentity = {
  platform: string | undefined;
  build: string | undefined;
  releasedAt: string | undefined;
};

/** The headers the app sends on every request to say which copy it is. */
export const APP_HEADERS = {
  platform: 'x-app-platform',
  build: 'x-app-build',
  releasedAt: 'x-app-released-at',
} as const;

function wholeNumber(value: string | undefined): number | null {
  if (value == null || !/^\d+$/.test(value.trim())) return null;
  return Number(value.trim());
}

function instant(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** Whether this copy of the app is still served, and if not, how it is mended. */
export function gateVerdict(identity: AppIdentity, config: GateConfig): GateVerdict {
  const platform = identity.platform?.toLowerCase();
  if (platform === 'android' || platform === 'ios') {
    const build = wholeNumber(identity.build);
    if (build != null && build < config.minBuild[platform]) return 'store';
  }
  const releasedAt = instant(identity.releasedAt);
  if (releasedAt != null && config.minReleasedAt != null && releasedAt < config.minReleasedAt) return 'restart';
  return null;
}

/**
 * Read from the environment on each call, so a changed minimum takes effect
 * on the next deploy without anything else having to know about it.
 * Unset or unreadable means no minimum.
 */
export function gateConfigFromEnv(env: Record<string, string | undefined> = process.env): GateConfig {
  return {
    minBuild: {
      android: wholeNumber(env.MIN_ANDROID_BUILD) ?? 0,
      ios: wholeNumber(env.MIN_IOS_BUILD) ?? 0,
    },
    minReleasedAt: instant(env.MIN_RELEASED_AT),
  };
}

function identityOf(header: (name: string) => string | undefined): AppIdentity {
  return {
    platform: header(APP_HEADERS.platform),
    build: header(APP_HEADERS.build),
    releasedAt: header(APP_HEADERS.releasedAt),
  };
}

/** What a turned-away request is answered with: 426, and how to mend it. */
export function updateRequiredBody(verdict: Exclude<GateVerdict, null>) {
  return { error: 'update_required', update: verdict } as const;
}

/**
 * Turns away a copy of the app the server no longer serves, with 426 Upgrade
 * Required, whatever it asked for. The app answers a 426 from anywhere by
 * drawing its update screen, so a route never has to know about any of this.
 */
export function appGate(config: () => GateConfig = gateConfigFromEnv): MiddlewareHandler {
  return async (c, next) => {
    const verdict = gateVerdict(identityOf((name) => c.req.header(name)), config());
    if (verdict) return c.json(updateRequiredBody(verdict), 426);
    await next();
  };
}

/**
 * `GET /app/gate`: the app asks on launch and on coming back, and draws its
 * update screen before anything else fails. Always answers 200, so the asking
 * is never itself the thing that is refused.
 */
export function appGateRoutes(config: () => GateConfig = gateConfigFromEnv) {
  const routes = new Hono();
  routes.get('/gate', (c) => c.json({ update: gateVerdict(identityOf((name) => c.req.header(name)), config()) }));
  return routes;
}
