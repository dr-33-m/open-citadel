import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { appGate, appGateRoutes, gateConfigFromEnv, gateVerdict, type GateConfig } from '../app-gate.js';

const config: GateConfig = { minBuild: { android: 40, ios: 12 }, minReleasedAt: Date.parse('2026-11-01T00:00:00Z') };
const current = { platform: 'android', build: '40', releasedAt: '2026-11-02T00:00:00Z' };

describe('gateVerdict', () => {
  it('serves a copy at or above every minimum', () => {
    expect(gateVerdict(current, config)).toBeNull();
  });

  it('sends a build below its platform minimum to the store', () => {
    expect(gateVerdict({ ...current, build: '39' }, config)).toBe('store');
    expect(gateVerdict({ ...current, platform: 'ios', build: '11' }, config)).toBe('store');
  });

  it('reads each platform against its own minimum', () => {
    expect(gateVerdict({ ...current, platform: 'ios', build: '39' }, config)).toBeNull();
  });

  it('asks JavaScript older than the minimum release to restart', () => {
    expect(gateVerdict({ ...current, releasedAt: '2026-10-31T23:59:59Z' }, config)).toBe('restart');
  });

  it('puts the store before a restart, since a restart cannot mend the binary', () => {
    expect(gateVerdict({ ...current, build: '1', releasedAt: '2020-01-01T00:00:00Z' }, config)).toBe('store');
  });

  it('serves a request that does not say which copy sent it', () => {
    expect(gateVerdict({ platform: undefined, build: undefined, releasedAt: undefined }, config)).toBeNull();
  });

  it('ignores a build or a date it cannot read', () => {
    expect(gateVerdict({ ...current, build: '1.5.2', releasedAt: 'yesterday' }, config)).toBeNull();
  });
});

describe('gateConfigFromEnv', () => {
  it('has no minimum when nothing is set', () => {
    expect(gateConfigFromEnv({})).toEqual({ minBuild: { android: 0, ios: 0 }, minReleasedAt: null });
  });

  it('reads the builds and the release time', () => {
    expect(gateConfigFromEnv({ MIN_ANDROID_BUILD: '40', MIN_IOS_BUILD: ' 12 ', MIN_RELEASED_AT: '2026-11-01T00:00:00Z' })).toEqual(config);
  });
});

describe('the gate on the server', () => {
  const server = new Hono();
  server.use('/tts/*', appGate(() => config));
  server.get('/tts/speak', (c) => c.text('spoken'));
  server.route('/app', appGateRoutes(() => config));

  const headers = (build: string) => ({ 'x-app-platform': 'android', 'x-app-build': build });

  it('answers an old copy 426 with how to mend it', async () => {
    const response = await server.request('/tts/speak', { headers: headers('39') });
    expect(response.status).toBe(426);
    expect(await response.json()).toEqual({ error: 'update_required', update: 'store' });
  });

  it('lets a current copy through', async () => {
    const response = await server.request('/tts/speak', { headers: headers('40') });
    expect(await response.text()).toBe('spoken');
  });

  it('answers the gate question with 200 either way', async () => {
    const old = await server.request('/app/gate', { headers: headers('39') });
    expect(old.status).toBe(200);
    expect(await old.json()).toEqual({ update: 'store' });
    expect(await (await server.request('/app/gate', { headers: headers('40') })).json()).toEqual({ update: null });
  });
});
