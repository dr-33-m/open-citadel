import { SignJWT } from 'jose';
import { SAMWELL_API_RESOURCE } from 'samwell-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The credential half: who may mint a token and what a token is worth.
 * `guest-identity` talks to the shared client rather than an injected one, so
 * the table is a map here. What is under test is the rules, not SQLite, which
 * `guest-linking.test.ts` exercises against a real file.
 */
const { rows } = vi.hoisted(() => ({
  rows: new Map<string, { secret_sha256: string; linked_account_id: string | null }>(),
}));

vi.mock('../db.js', () => ({
  db: {
    execute: vi.fn(async (query: { sql: string; args: unknown[] }) => {
      const id = String(query.args[0]);
      if (query.sql.includes('INSERT INTO guest_identities')) {
        rows.set(id, { secret_sha256: String(query.args[1]), linked_account_id: null });
        return { rows: [] };
      }
      const row = rows.get(id);
      return { rows: row ? [{ guest_id: id, ...row }] : [] };
    }),
  },
}));

const {
  GUEST_ISSUER,
  guestAccessConfigured,
  isGuestId,
  isGuestSecret,
  issueGuestToken,
  registerGuest,
  verifyGuestToken,
} = await import('../guest-identity.js');

const GUEST = 'guest:0f5f1d3a-9b1c-4e2a-8f6d-2b7c9e4a1d55';
const SECRET = 'a'.repeat(64);
const OTHER_SECRET = 'b'.repeat(64);

beforeEach(() => {
  rows.clear();
  process.env.GUEST_TOKEN_SECRET = 'k'.repeat(48);
});

describe('what counts as a guest', () => {
  it('takes the shape the app mints and nothing else', () => {
    expect(isGuestId(GUEST)).toBe(true);
    expect(isGuestId('guest:not-a-uuid')).toBe(false);
    // No prefix is an account subject, and must never be read as a guest.
    expect(isGuestId('0f5f1d3a-9b1c-4e2a-8f6d-2b7c9e4a1d55')).toBe(false);
    expect(isGuestId('account:reader-sub')).toBe(false);
  });

  it('wants a full-entropy secret', () => {
    expect(isGuestSecret(SECRET)).toBe(true);
    expect(isGuestSecret('short')).toBe(false);
    expect(isGuestSecret('z'.repeat(64))).toBe(false);
  });

  it('is unavailable without a signing key worth the name', () => {
    process.env.GUEST_TOKEN_SECRET = 'too-short';
    expect(guestAccessConfigured()).toBe(false);
    delete process.env.GUEST_TOKEN_SECRET;
    expect(guestAccessConfigured()).toBe(false);
  });
});

describe('registering', () => {
  it('creates once and is idempotent for the same device', async () => {
    expect(await registerGuest(GUEST, SECRET)).toBe('created');
    // A retry after a dropped response must not look like a failure.
    expect(await registerGuest(GUEST, SECRET)).toBe('exists');
  });

  it('refuses the same id under a different secret', async () => {
    await registerGuest(GUEST, SECRET);
    // The only shape that would let somebody claim another device's identity.
    expect(await registerGuest(GUEST, OTHER_SECRET)).toBe('taken');
  });
});

describe('tokens', () => {
  it('mints one the verifier accepts, naming the guest', async () => {
    await registerGuest(GUEST, SECRET);
    const result = await issueGuestToken(GUEST, SECRET);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await verifyGuestToken(result.token)).toBe(GUEST);
  });

  it('will not mint for a wrong secret, or for a device it has never seen', async () => {
    await registerGuest(GUEST, SECRET);
    // The same answer either way: which of the two it is, is not something a
    // caller should be able to learn.
    expect(await issueGuestToken(GUEST, OTHER_SECRET)).toEqual({ ok: false, reason: 'unknown' });
    expect(await issueGuestToken('guest:11111111-1111-4111-8111-111111111111', SECRET)).toEqual({
      ok: false,
      reason: 'unknown',
    });
  });

  it('stops minting once the device has an account', async () => {
    await registerGuest(GUEST, SECRET);
    rows.get(GUEST)!.linked_account_id = 'account:reader-sub';

    // Its own signal, so the app signs in rather than minting a second
    // identity and orphaning the subscription.
    expect(await issueGuestToken(GUEST, SECRET)).toEqual({ ok: false, reason: 'linked' });
  });

  it('rejects a token signed by somebody else', async () => {
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(GUEST)
      .setIssuer(GUEST_ISSUER)
      .setAudience(SAMWELL_API_RESOURCE)
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('not-the-servers-key-not-the-servers-key'));

    await expect(verifyGuestToken(forged)).rejects.toThrow();
  });

  it('rejects a token of ours that names something other than a guest', async () => {
    const wrongSubject = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('account:reader-sub')
      .setIssuer(GUEST_ISSUER)
      .setAudience(SAMWELL_API_RESOURCE)
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(process.env.GUEST_TOKEN_SECRET!));

    await expect(verifyGuestToken(wrongSubject)).rejects.toThrow();
  });

  it('rejects one that has expired', async () => {
    const stale = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(GUEST)
      .setIssuer(GUEST_ISSUER)
      .setAudience(SAMWELL_API_RESOURCE)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(process.env.GUEST_TOKEN_SECRET!));

    await expect(verifyGuestToken(stale)).rejects.toThrow();
  });
});
