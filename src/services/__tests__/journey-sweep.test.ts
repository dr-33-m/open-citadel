import type { JournalNote } from 'samwell-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JournalRefused, JournalRejected, sweepJournal, type JournalStrikes, type SweepDeps, type SweepSession } from '@/services/journey-sweep';
import type { JournalMessage } from '@/utils/journal-plan';

const NOW = Date.parse('2026-10-30T12:00:00.000Z');
const HOUR_AGO = new Date(NOW - 3_600_000).toISOString();
const NOTE: JournalNote = { text: 'Runs before work.', tags: ['running'] };
const SAID: JournalMessage[] = [
  { role: 'user', content: 'I have been running before work and it is finally starting to stick for me.', createdAt: HOUR_AGO, via: 'cloud' },
  { role: 'assistant', content: 'Good.', createdAt: HOUR_AGO, via: 'cloud' },
];

const session = (id: string, kind: SweepSession['kind'] = 'reading'): SweepSession => ({ id, kind, bookId: null, journaledAt: null });

function deps(list: SweepSession[], request: SweepDeps['request'] = async () => [NOTE]) {
  return {
    sessions: () => list,
    fresh: () => SAID,
    before: () => [],
    request: vi.fn(request),
    exists: vi.fn(() => true),
    commit: vi.fn(),
  } satisfies SweepDeps;
}

let strikes: JournalStrikes;
const run = (d: SweepDeps) => sweepJournal(d, { quietMs: 0, now: NOW, strikes });

beforeEach(() => {
  strikes = new Map();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('sweepJournal', () => {
  it('saves the notes and moves the watermark together', async () => {
    const d = deps([session('a')]);
    await run(d);
    expect(d.commit).toHaveBeenCalledWith('a', [NOTE], HOUR_AGO);
  });

  it('asks for at most three in one sweep', async () => {
    const d = deps(['a', 'b', 'c', 'd'].map((id) => session(id)));
    await run(d);
    expect(d.request).toHaveBeenCalledTimes(3);
  });

  it('keeps nothing from a chat deleted while the request was out', async () => {
    const d = deps([session('a')]);
    d.exists.mockReturnValue(false);
    await run(d);
    expect(d.commit).not.toHaveBeenCalled();
  });

  it('goes on past a conversation the server rejected, leaving it for later', async () => {
    const d = deps([session('bad'), session('good')], async (s) => {
      if (s.id === 'bad') throw new JournalRejected('502');
      return [NOTE];
    });
    await run(d);
    expect(d.commit.mock.calls.map((call) => call[0])).toEqual(['good']);
    expect(strikes.get('bad')).toBe(1);
  });

  it('stops asking about a conversation rejected three times', async () => {
    const d = deps([session('bad')], async () => {
      throw new JournalRejected('502');
    });
    for (let i = 0; i < 5; i++) await run(d);
    expect(d.request).toHaveBeenCalledTimes(3);
  });

  it('clears the strikes once a conversation goes through', async () => {
    strikes.set('a', 2);
    await run(deps([session('a')]));
    expect(strikes.has('a')).toBe(false);
  });

  it('ends the sweep on a network failure, without a strike or a commit', async () => {
    const d = deps([session('a'), session('b')], async () => {
      throw new TypeError('Network request failed');
    });
    await run(d);
    expect(d.request).toHaveBeenCalledTimes(1);
    expect(d.commit).not.toHaveBeenCalled();
    expect(strikes.size).toBe(0);
  });

  it('reports a refusal and stops', async () => {
    const d = deps([session('a'), session('b')], async () => {
      throw new JournalRefused('402');
    });
    expect(await run(d)).toEqual({ refused: true });
    expect(d.request).toHaveBeenCalledTimes(1);
  });

  it('moves the watermark without a call when too little was said', async () => {
    const d = deps([session('a')]);
    d.fresh = () => [{ role: 'user', content: 'thanks', createdAt: HOUR_AGO, via: 'cloud' }];
    await run(d);
    expect(d.request).not.toHaveBeenCalled();
    expect(d.commit).toHaveBeenCalledWith('a', [], HOUR_AGO);
  });
});
