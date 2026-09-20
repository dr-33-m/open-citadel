import { describe, expect, it } from 'vitest';

import {
  MIN_USER_CHARS,
  REPLY_GRACE_MS,
  planJournalEntry,
  type JournalMessage,
} from '../journal-plan';

const NOW = Date.parse('2026-09-19T12:00:00.000Z');
const HOUR = 60 * 60_000;

function at(msAgo: number): string {
  return new Date(NOW - msAgo).toISOString();
}

function msg(
  role: 'user' | 'assistant',
  content: string,
  msAgo: number,
  via: JournalMessage['via'] = 'cloud',
): JournalMessage {
  return { role, content, createdAt: at(msAgo), via };
}

const LONG = 'I keep skipping my Monday runs after late shifts and it is getting to me.';

describe('planJournalEntry', () => {
  it('leaves a session with nothing new alone', () => {
    expect(planJournalEntry({ fresh: [], before: [], now: NOW, quietMs: 0 })).toBeNull();
  });

  it('waits until the conversation has been quiet long enough', () => {
    const fresh = [msg('user', LONG, 6 * 60_000), msg('assistant', 'That sounds hard.', 5 * 60_000)];
    expect(planJournalEntry({ fresh, before: [], now: NOW, quietMs: 10 * 60_000 })).toBeNull();
    expect(planJournalEntry({ fresh, before: [], now: NOW, quietMs: 0 })).not.toBeNull();
  });

  it('does not write up a question whose reply may still be coming', () => {
    const fresh = [msg('user', LONG, REPLY_GRACE_MS - 1000)];
    expect(planJournalEntry({ fresh, before: [], now: NOW, quietMs: 0 })).toBeNull();
  });

  it('never sends what was said on the device', () => {
    const fresh = [
      msg('user', `On device: ${LONG}`, 3 * HOUR, 'device'),
      msg('assistant', 'Local reply.', 3 * HOUR - 1000, 'device'),
      msg('user', `Unknown engine: ${LONG}`, 2 * HOUR, null),
      msg('user', `In the cloud: ${LONG}`, HOUR),
      msg('assistant', 'Cloud reply.', HOUR - 1000),
    ];
    const plan = planJournalEntry({ fresh, before: [], now: NOW, quietMs: 0 });
    expect(plan?.conversation).toContain('In the cloud');
    expect(plan?.conversation).not.toContain('On device');
    expect(plan?.conversation).not.toContain('Local reply');
    expect(plan?.conversation).not.toContain('Unknown engine');
  });

  it('moves the watermark past device turns without sending anything', () => {
    const fresh = [msg('user', LONG, HOUR, 'device'), msg('assistant', 'Reply.', HOUR - 1000, 'device')];
    const plan = planJournalEntry({ fresh, before: [], now: NOW, quietMs: 0 });
    expect(plan).toEqual({ through: at(HOUR - 1000), conversation: null, earlier: '' });
  });

  it('moves past small talk without a call', () => {
    const fresh = [msg('user', 'thanks!', HOUR), msg('assistant', 'Any time.', HOUR - 1000)];
    expect('thanks!'.length).toBeLessThan(MIN_USER_CHARS);
    const plan = planJournalEntry({ fresh, before: [], now: NOW, quietMs: 0 });
    expect(plan?.conversation).toBeNull();
    expect(plan?.through).toBe(at(HOUR - 1000));
  });

  it('labels turns and carries earlier context from the cloud only', () => {
    const before = [
      msg('user', 'Earlier on device', 5 * HOUR, 'device'),
      msg('user', 'Earlier in the cloud', 4 * HOUR),
    ];
    const fresh = [msg('user', LONG, HOUR), msg('assistant', 'Noted.', HOUR - 1000)];
    const plan = planJournalEntry({ fresh, before, now: NOW, quietMs: 0 });
    expect(plan?.conversation).toBe(`User: ${LONG}\nSamwell: Noted.`);
    expect(plan?.earlier).toBe('User: Earlier in the cloud');
  });

  it('keeps the end of a conversation too long to send', () => {
    const fresh = Array.from({ length: 40 }, (_, i) =>
      msg('user', `${i} ${'x'.repeat(900)}`, HOUR - i * 1000),
    );
    const plan = planJournalEntry({ fresh, before: [], now: NOW, quietMs: 0 });
    expect(plan?.conversation?.length).toBeLessThanOrEqual(15000);
    expect(plan?.conversation).toContain('User: 39 ');
    expect(plan?.conversation).not.toContain('User: 0 ');
    expect(plan?.through).toBe(fresh.at(-1)?.createdAt);
  });
});
