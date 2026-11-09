import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/constants/samwell-cloud', () => ({ SAMWELL_CLOUD_BASE_URL: 'https://cloud.test' }));

const sent: { url: string; headers: Headers }[] = [];
let status = 200;
const realFetch = globalThis.fetch;

beforeEach(() => {
  sent.length = 0;
  status = 200;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    sent.push({ url, headers: new Headers(init?.headers) });
    return new Response('{"update":"store"}', { status });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.resetModules();
});

async function install(onUpgradeRequired = vi.fn()) {
  const { identifyCloudFetches } = await import('../identify-fetch');
  identifyCloudFetches({ headers: { 'X-App-Build': '40' }, onUpgradeRequired });
  return onUpgradeRequired;
}

describe('identifyCloudFetches', () => {
  it('adds the identity to a request to the cloud and keeps its own headers', async () => {
    await install();
    await fetch('https://cloud.test/models', { headers: { Authorization: 'Bearer a' } });
    expect(sent[0].headers.get('X-App-Build')).toBe('40');
    expect(sent[0].headers.get('Authorization')).toBe('Bearer a');
  });

  it('keeps the headers of a Request passed on its own', async () => {
    await install();
    await fetch(new Request('https://cloud.test/models', { headers: { Authorization: 'Bearer b' } }));
    expect(sent[0].headers.get('Authorization')).toBe('Bearer b');
    expect(sent[0].headers.get('X-App-Build')).toBe('40');
  });

  it('leaves other hosts alone', async () => {
    await install();
    await fetch('https://feeds.test/rss');
    expect(sent[0].headers.get('X-App-Build')).toBeNull();
  });

  it('hears a 426 from the cloud', async () => {
    const heard = await install();
    status = 426;
    await fetch('https://cloud.test/tts/speak');
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
