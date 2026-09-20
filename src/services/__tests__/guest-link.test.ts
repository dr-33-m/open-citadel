import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The request that decides who owns a subscription for the rest of its life.
 * What is under test is that it proves both identities separately and that it
 * refuses rather than guesses when the account already holds a plan.
 */
const { getAccountToken, guestToken, fetchMock } = vi.hoisted(() => ({
  getAccountToken: vi.fn(async (): Promise<string | null> => 'account-token'),
  guestToken: vi.fn(async (): Promise<string | null> => 'guest-token'),
  fetchMock: vi.fn(),
}));

vi.mock('@/services/account', () => ({ getAccountToken }));
vi.mock('@/services/guest-identity', () => ({ guestToken }));
vi.mock('@/constants/samwell-cloud', () => ({
  SAMWELL_CLOUD_BASE_URL: 'https://cloud.example.com',
}));

const { linkGuestToAccount } = await import('../guest-link');

/** The headers of the one request, for the claims below. */
function sentHeaders(): Record<string, string> {
  return fetchMock.mock.calls[0]?.[1]?.headers ?? {};
}

beforeEach(() => {
  vi.clearAllMocks();
  getAccountToken.mockResolvedValue('account-token');
  guestToken.mockResolvedValue('guest-token');
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ linked: true }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

describe('linkGuestToAccount', () => {
  it('proves each identity with its own token', async () => {
    expect(await linkGuestToAccount()).toBe('linked');

    // The bug this guards: `cloudHeaders` falls back to the guest token when
    // there is no account, so reaching for it here would send one token as
    // both halves and ask the server to link a guest to itself.
    expect(sentHeaders().Authorization).toBe('Bearer account-token');
    expect(sentHeaders()['X-Guest-Authorization']).toBe('Bearer guest-token');
    expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe('/account/link');
  });

  it('does nothing when there is no account to link to', async () => {
    getAccountToken.mockResolvedValue(null);

    expect(await linkGuestToAccount()).toBe('nothing');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when this device never bought anything', async () => {
    guestToken.mockResolvedValue(null);

    expect(await linkGuestToAccount()).toBe('nothing');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports the refusal rather than merging two plans', async () => {
    // Somebody has probably just paid twice by accident. Nothing is taken
    // from either side and the app says so.
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'account_has_plan' }), { status: 409 }),
    );

    expect(await linkGuestToAccount()).toBe('accountHasPlan');
  });

  it('throws on anything else, so the next launch tries again', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 500 }));

    await expect(linkGuestToAccount()).rejects.toThrow(/500/);
  });
});
