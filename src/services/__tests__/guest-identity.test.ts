import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The device half of guest access: what is kept, what is asked for again, and
 * what happens when the server has never heard of this phone. The Keychain is
 * a map here and the server is a fake; the rules are what is under test.
 */
const { store, fetchMock, randomBytes } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  fetchMock: vi.fn(),
  randomBytes: new Uint8Array(32).fill(0xab),
}));

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only',
  getItemAsync: vi.fn(async (key: string) => store.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    store.delete(key);
  }),
}));
vi.mock('expo-crypto', () => ({
  randomUUID: () => '0f5f1d3a-9b1c-4e2a-8f6d-2b7c9e4a1d55',
  getRandomBytesAsync: async () => randomBytes,
}));
vi.mock('@/constants/samwell-cloud', () => ({
  SAMWELL_CLOUD_BASE_URL: 'https://cloud.example.com',
}));

const { clearGuestToken, ensureGuestIdentity, forgetGuestIdentity, guestToken, readGuestIdentity } =
  await import('../guest-identity');

const GUEST_ID = 'guest:0f5f1d3a-9b1c-4e2a-8f6d-2b7c9e4a1d55';
const SECRET = 'ab'.repeat(32);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** Paths called, in order, so ordering claims can be checked. */
function calls(): string[] {
  return fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname);
}

beforeEach(() => {
  store.clear();
  fetchMock.mockReset();
  clearGuestToken();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('minting an identity', () => {
  it('keeps the id and the secret, and tells the server', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ guestId: GUEST_ID }, 201));

    const identity = await ensureGuestIdentity();

    expect(identity).toEqual({ guestId: GUEST_ID, secret: SECRET });
    expect(calls()).toEqual(['/account/guest']);
    expect(await readGuestIdentity()).toEqual(identity);
  });

  it('mints once and reuses it', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ guestId: GUEST_ID }, 201));
    const first = await ensureGuestIdentity();
    const second = await ensureGuestIdentity();
    expect(second).toEqual(first);
  });

  it('keeps an identity the server could not be told about', async () => {
    // The purchase still has to land somewhere the webhook can credit, so the
    // id RevenueCat is about to be given must survive a failed registration.
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(ensureGuestIdentity()).rejects.toThrow();
    expect(await readGuestIdentity()).toEqual({ guestId: GUEST_ID, secret: SECRET });
  });

  it('is not a guest until something is minted', async () => {
    expect(await readGuestIdentity()).toBeNull();
    expect(await guestToken()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats half an identity as none', async () => {
    store.set('samwell.guest.id', GUEST_ID);
    expect(await readGuestIdentity()).toBeNull();
  });
});

describe('tokens', () => {
  beforeEach(() => {
    store.set('samwell.guest.id', GUEST_ID);
    store.set('samwell.guest.secret', SECRET);
  });

  it('exchanges the secret once and reuses the token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ token: 'tok-1', expiresIn: 3600 }));

    expect(await guestToken()).toBe('tok-1');
    expect(await guestToken()).toBe('tok-1');
    expect(calls()).toEqual(['/account/guest/token']);
  });

  it('asks again once the token is near its expiry', async () => {
    // Shorter than the skew, so it is already considered spent.
    fetchMock.mockResolvedValueOnce(jsonResponse({ token: 'tok-1', expiresIn: 30 }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ token: 'tok-2', expiresIn: 3600 }));

    expect(await guestToken()).toBe('tok-1');
    expect(await guestToken()).toBe('tok-2');
  });

  it('registers and retries when the server has never heard of this device', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'unknown_guest' }, 401));
    fetchMock.mockResolvedValueOnce(jsonResponse({ guestId: GUEST_ID }, 201));
    fetchMock.mockResolvedValueOnce(jsonResponse({ token: 'tok-1', expiresIn: 3600 }));

    expect(await guestToken()).toBe('tok-1');
    expect(calls()).toEqual([
      '/account/guest/token',
      '/account/guest',
      '/account/guest/token',
    ]);
  });

  it('gives up rather than pretending, once the device has an account', async () => {
    // The plan has moved to an account; the app must sign in, not keep asking.
    fetchMock.mockResolvedValue(jsonResponse({ error: 'guest_linked' }, 409));
    await expect(guestToken()).rejects.toThrow(/409/);
  });

  it('shares one exchange between callers waking together', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ token: 'tok-1', expiresIn: 3600 }));

    const [a, b, c] = await Promise.all([guestToken(), guestToken(), guestToken()]);

    expect([a, b, c]).toEqual(['tok-1', 'tok-1', 'tok-1']);
    expect(calls()).toEqual(['/account/guest/token']);
  });

  it('forgets the credential when the plan moves to an account', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ token: 'tok-1', expiresIn: 3600 }));
    await guestToken();

    await forgetGuestIdentity();

    expect(await readGuestIdentity()).toBeNull();
    expect(await guestToken()).toBeNull();
  });
});
