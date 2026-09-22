import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The device half of guest access: what is kept, what is asked for again, and
 * what happens when the server has never heard of this phone. The Keychain is
 * a map here and the server is a fake; the rules are what is under test.
 */
const { store, fetchMock, getItem, randomBytes } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  fetchMock: vi.fn(),
  /** Counted, because how often the Keychain is asked is part of the design. */
  getItem: vi.fn(async (key: string) => store.get(key) ?? null),
  randomBytes: new Uint8Array(32).fill(0xab),
}));

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only',
  getItemAsync: getItem,
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

const {
  GuestLinked,
  clearGuestToken,
  ensureGuestIdentity,
  forgetGuestLink,
  guestToken,
  onGuestRetired,
  readGuestIdentity,
  readLinkedGuest,
  retireGuestIdentity,
} = await import('../guest-identity');

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
  getItem.mockClear();
  // Drops both memory caches, which is what makes each test start over.
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

  it('mints anyway when the server cannot be told', async () => {
    // This runs with the store sheet about to open. The purchase has to land
    // somewhere the webhook can credit, and the id is what decides that, so a
    // failed registration must not stop the sale. `guestToken` repairs it.
    fetchMock.mockRejectedValue(new Error('offline'));

    expect(await ensureGuestIdentity()).toEqual({ guestId: GUEST_ID, secret: SECRET });
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

  it('does not tell the server again about a device it already minted', async () => {
    store.set('samwell.guest.id', GUEST_ID);
    store.set('samwell.guest.secret', SECRET);

    expect(await ensureGuestIdentity()).toEqual({ guestId: GUEST_ID, secret: SECRET });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not let a read that started first bury an identity minted since', async () => {
    // A read begins while this device is nobody and lands after a purchase
    // has minted an identity. What it saw is out of date by the time it can
    // say it, and remembering its "no" would leave a reader who has just paid
    // with no credential to spend the credits with.
    fetchMock.mockResolvedValue(jsonResponse({ guestId: GUEST_ID }, 201));
    let land: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      land = resolve;
    });
    // Both keys of the first read, held open and answering as of then.
    getItem.mockImplementationOnce(async () => {
      await held;
      return null;
    });
    getItem.mockImplementationOnce(async () => {
      await held;
      return null;
    });

    const earlyRead = readGuestIdentity();
    const minted = await ensureGuestIdentity();
    land();

    expect(await earlyRead).toEqual(minted);
    expect(await readGuestIdentity()).toEqual(minted);
  });

  it('mints once when two callers ask together', async () => {
    // Both see no identity and both mint. Their four Keychain writes
    // interleave, and this device ends up holding one caller's id beside the
    // other's secret - a pair the server has never seen and never will.
    fetchMock.mockResolvedValue(jsonResponse({ guestId: GUEST_ID }, 201));

    const [first, second] = await Promise.all([ensureGuestIdentity(), ensureGuestIdentity()]);

    expect(second).toEqual(first);
    expect(calls()).toEqual(['/account/guest']);
    expect(await readGuestIdentity()).toEqual(first);
  });

  it('asks the Keychain once and remembers the no', async () => {
    // Every request a signed-out reader makes asks this question, and for
    // almost all of them the answer is the same no.
    expect(await readGuestIdentity()).toBeNull();
    expect(await readGuestIdentity()).toBeNull();

    expect(getItem).toHaveBeenCalledTimes(2); // The two keys, once each.
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

  it('says so by name, once the plan has moved to an account', async () => {
    // Its own type, not a status code in a string, because this is the one
    // refusal with somewhere to go: the caller lets the identity go rather
    // than retrying a request that can never work again.
    fetchMock.mockResolvedValue(jsonResponse({ error: 'guest_linked' }, 409));
    await expect(guestToken()).rejects.toBeInstanceOf(GuestLinked);
  });

  it('shares one exchange between callers waking together', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ token: 'tok-1', expiresIn: 3600 }));

    const [a, b, c] = await Promise.all([guestToken(), guestToken(), guestToken()]);

    expect([a, b, c]).toEqual(['tok-1', 'tok-1', 'tok-1']);
    expect(calls()).toEqual(['/account/guest/token']);
  });

  it('keeps a token that arrived after the device stopped being a guest', async () => {
    // Linking lands mid-exchange. The token is still good for the caller that
    // asked, but it belongs to an identity that no longer exists, so it must
    // not be left in memory for the next request to pick up.
    let deliver: (response: Response) => void = () => undefined;
    const asked = new Promise<void>((started) => {
      fetchMock.mockImplementationOnce(() => {
        started();
        return new Promise<Response>((resolve) => {
          deliver = resolve;
        });
      });
    });
    const pending = guestToken();
    await asked;

    await retireGuestIdentity();
    deliver(jsonResponse({ token: 'tok-1', expiresIn: 3600 }));

    expect(await pending).toBe('tok-1');
    expect(await guestToken()).toBeNull();
  });

  it('does not exchange a secret that was deleted while it was being read', async () => {
    // The Keychain read starts before the link lands and finishes after it.
    // What comes back is a deleted identity and must not be spent.
    const pending = guestToken();
    await retireGuestIdentity();

    expect(await pending).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('drops the credential when the guest joins an account', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ token: 'tok-1', expiresIn: 3600 }));
    await guestToken();

    await retireGuestIdentity();

    expect(await readGuestIdentity()).toBeNull();
    expect(await guestToken()).toBeNull();
  });

  it('never mints a second guest once the first has joined an account', async () => {
    // A second guest is how a signed-out Buy or Restore used to pull the
    // account's subscription onto the phone. One guest per device.
    fetchMock.mockResolvedValue(jsonResponse({ guestId: GUEST_ID }, 201));
    await ensureGuestIdentity();
    await retireGuestIdentity();
    fetchMock.mockClear();

    await expect(ensureGuestIdentity()).rejects.toBeInstanceOf(GuestLinked);
    expect(await readLinkedGuest()).toBe(GUEST_ID);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('remembers the link when the server is the one to report it', async () => {
    // The link landed and its answer never came home; the next token
    // exchange is where the device finds out.
    const retired = vi.fn();
    const stop = onGuestRetired(retired);
    fetchMock.mockResolvedValue(jsonResponse({ error: 'guest_linked' }, 409));
    await expect(guestToken()).rejects.toBeInstanceOf(GuestLinked);
    stop();

    // Told, so the store stops drawing a guest before the next launch.
    expect(retired).toHaveBeenCalledTimes(1);
    expect(await readLinkedGuest()).toBe(GUEST_ID);
    await expect(ensureGuestIdentity()).rejects.toBeInstanceOf(GuestLinked);
  });
});

describe("a tester's reset", () => {
  it('forgets a link, so the device can buy as a new guest', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ guestId: GUEST_ID }, 201));
    await ensureGuestIdentity();
    await retireGuestIdentity();

    expect(await forgetGuestLink()).toBe(true);

    expect(await readLinkedGuest()).toBeNull();
    await expect(ensureGuestIdentity()).resolves.toEqual({ guestId: GUEST_ID, secret: SECRET });
  });

  it('never touches a live guest, which may hold a plan no account has', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ guestId: GUEST_ID }, 201));
    await ensureGuestIdentity();

    expect(await forgetGuestLink()).toBe(false);

    expect(await readGuestIdentity()).toEqual({ guestId: GUEST_ID, secret: SECRET });
  });
});
