import { describe, expect, it } from 'vitest';

import { unansweredMessageIds } from '../unanswered';

const user = (id: string) => ({ id, role: 'user' });
const samwell = (id: string) => ({ id, role: 'assistant' });

describe('unansweredMessageIds', () => {
  it('finds nothing in a conversation where every message was answered', () => {
    expect([...unansweredMessageIds([user('u1'), samwell('a1'), user('u2'), samwell('a2')], false)]).toEqual([]);
  });

  it('finds a message that failed and was followed by another', () => {
    expect([...unansweredMessageIds([user('u1'), user('u2'), samwell('a2')], false)]).toEqual(['u1']);
  });

  it('finds the last message when its turn ended with nothing', () => {
    expect([...unansweredMessageIds([user('u1'), samwell('a1'), user('u2')], false)]).toEqual(['u2']);
  });

  it('leaves the last message alone while it is being answered', () => {
    expect([...unansweredMessageIds([user('u1'), samwell('a1'), user('u2')], true)]).toEqual([]);
  });

  it('looks past rows that are not turns', () => {
    const rows = [{ id: 's', role: 'system' }, user('u1'), { id: 't', role: 'tool' }, samwell('a1')];
    expect([...unansweredMessageIds(rows, false)]).toEqual([]);
  });
});
