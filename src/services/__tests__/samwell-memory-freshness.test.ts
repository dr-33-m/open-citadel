import { beforeEach, describe, expect, it, vi } from 'vitest';

const invalidate = vi.fn();
vi.mock('@/query-manager/samwell-memory/invalidate', () => ({ invalidateSamwellMemory: invalidate }));

/** Any chain of calls on the database, ending in nothing found. */
const chain: unknown = new Proxy(() => undefined, {
  get: (_target, key) => (key === 'all' ? () => [] : key === 'get' ? () => undefined : key === 'run' ? () => undefined : chain),
  apply: () => chain,
});
vi.mock('@/db/client', () => ({ db: chain }));

const { removeSession } = await import('@/services/chat-sessions');
const { saveJourneyReflection, saveGoalFinishedNote } = await import('@/services/journey');

beforeEach(() => invalidate.mockClear());

describe('the list of what Samwell has kept', () => {
  it('is read again when a chat, and so its notes, are deleted', () => {
    removeSession('chat-1');
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('is read again when a note is written', () => {
    saveJourneyReflection('They run before work.', 'goal:1');
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('is read again when a goal writes its ending', () => {
    saveGoalFinishedNote('g1', 'Run a half marathon', {
      status: 'COMPLETED',
      startDate: '2026-01-01',
      endDate: '2026-03-01',
      consistencyPct: 90,
      outcomeSummary: null,
      reason: null,
      takeaway: null,
    } as never);
    expect(invalidate).toHaveBeenCalled();
  });
});
