import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NO_PLAN_BALANCE } from 'samwell-shared';

/*
 * The two insider routes, with the ledger and the sign-in stubbed out: what
 * is under test here is who may call them and what they answer, and
 * `billing.test.ts` already covers what a code does once it is let through.
 */
const mocks = vi.hoisted(() => ({
  readIdentity: vi.fn(),
  redeemInsiderInvite: vi.fn(),
  issueInsiderInvite: vi.fn(),
  listInsiderInvites: vi.fn(),
}));

vi.mock('../identity.js', () => ({ readIdentity: mocks.readIdentity }));
vi.mock('../billing.js', () => ({
  billing: {
    redeemInsiderInvite: mocks.redeemInsiderInvite,
    issueInsiderInvite: mocks.issueInsiderInvite,
    listInsiderInvites: mocks.listInsiderInvites,
  },
}));
vi.mock('../db.js', () => ({
  getDefaultModelIdForPlan: vi.fn(),
  getForecastWorkload: vi.fn(),
  listCloudModels: vi.fn(),
}));
vi.mock('../voice-catalog.js', () => ({ voiceCatalog: { list: vi.fn() } }));

const { billingRoutes, insiderAdminRoutes } = await import('../billing-routes.js');

const CODE = 'A1B2C-3D4E5-F6A7B-8C9D0';
let reader = 0;

function redeem(code: unknown = CODE) {
  return billingRoutes.request('/insider/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
}

function admin(method: 'GET' | 'POST', body?: unknown, key: string | null = 'founder') {
  return insiderAdminRoutes.request('/invites', {
    method,
    headers: { 'content-type': 'application/json', ...(key ? { 'x-admin-key': key } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_API_KEY = 'founder';
  // A reader of their own each test, so one test's tries are not another's.
  reader += 1;
  mocks.readIdentity.mockResolvedValue({
    id: `account:reader-${reader}`,
    sub: `reader-${reader}`,
    kind: 'account',
  });
});

describe('POST /billing/insider/redeem', () => {
  it('answers with the plan, the term and when it ends', async () => {
    const balance = { ...NO_PLAN_BALANCE, plan: 'maester', source: 'insider' };
    mocks.redeemInsiderInvite.mockResolvedValue({
      redeemed: true,
      balance,
      plan: 'maester',
      duration: 'year',
      endsAt: '2027-10-13T00:00:00.000Z',
    });

    const response = await redeem();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      balance,
      redemption: { plan: 'maester', duration: 'year', endsAt: '2027-10-13T00:00:00.000Z' },
    });
    expect(mocks.redeemInsiderInvite).toHaveBeenCalledWith({
      accountId: `account:reader-${reader}`,
      code: CODE,
    });
  });

  it('wants an account, and does not spend the code finding out', async () => {
    mocks.readIdentity.mockResolvedValue({ id: 'guest:abc', sub: 'guest:abc', kind: 'guest' });
    const response = await redeem();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'account_required' });
    expect(mocks.redeemInsiderInvite).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown_code', 404],
    ['already_redeemed', 409],
    ['already_subscribed', 409],
  ] as const)('says why with %s', async (reason, status) => {
    mocks.redeemInsiderInvite.mockResolvedValue({ redeemed: false, reason });
    const response = await redeem();
    expect(response.status).toBe(status);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe(reason);
    expect(body.message.length).toBeGreaterThan(0);
  });

  it('stops answering after ten tries in a row', async () => {
    mocks.redeemInsiderInvite.mockResolvedValue({ redeemed: false, reason: 'unknown_code' });
    for (let attempt = 0; attempt < 10; attempt += 1) expect((await redeem()).status).toBe(404);
    const response = await redeem();
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: 'too_many_attempts' });
    expect(mocks.redeemInsiderInvite).toHaveBeenCalledTimes(10);
  });

  it('refuses a body with no code', async () => {
    expect((await redeem('')).status).toBe(400);
  });
});

describe('/admin/insider/invites', () => {
  it('is closed without the admin key', async () => {
    expect((await admin('POST', { plan: 'maester', duration: 'year' }, null)).status).toBe(401);
    expect((await admin('GET', undefined, 'wrong')).status).toBe(401);
    expect(mocks.issueInsiderInvite).not.toHaveBeenCalled();
  });

  it('mints a code for a package and a duration, and reads it back', async () => {
    mocks.issueInsiderInvite.mockResolvedValue({
      code: CODE,
      plan: 'maester',
      duration: 'year',
      durationDays: 365,
    });
    const response = await admin('POST', { plan: 'maester', duration: 'year', note: 'For Ada' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      code: CODE,
      plan: 'maester',
      duration: 'year',
      durationDays: 365,
      label: '1 year · Maester Samwell',
    });
    expect(mocks.issueInsiderInvite).toHaveBeenCalledWith({
      plan: 'maester',
      duration: 'year',
      note: 'For Ada',
    });
  });

  it('takes only the four durations and the three packages', async () => {
    expect((await admin('POST', { plan: 'maester', duration: 'fortnight' })).status).toBe(400);
    expect((await admin('POST', { plan: 'maester', durationDays: 30 })).status).toBe(400);
    expect((await admin('POST', { plan: 'lord_commander', duration: 'year' })).status).toBe(400);
    expect(mocks.issueInsiderInvite).not.toHaveBeenCalled();
  });

  it('lists what has been minted', async () => {
    mocks.listInsiderInvites.mockResolvedValue([{ code: CODE }]);
    const response = await admin('GET');
    expect(await response.json()).toEqual({ invites: [{ code: CODE }] });
    expect(mocks.listInsiderInvites).toHaveBeenCalledWith(100);
  });
});
