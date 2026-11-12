import { describe, expect, it } from 'vitest';

import { holdCardReply } from '../card-reply';

const user = { id: 'u', role: 'user' };
const reply = { id: 'a', role: 'assistant' };

describe('holdCardReply', () => {
  it('draws the last reply under the card', () => {
    expect(holdCardReply([user, reply], true)).toEqual({ turns: [user], trailingReply: reply });
  });

  it('leaves the list alone without a card', () => {
    const turns = [user, reply];
    expect(holdCardReply(turns, false)).toEqual({ turns, trailingReply: null });
  });

  it('holds nothing while the newest turn is still the reader', () => {
    const turns = [reply, user];
    expect(holdCardReply(turns, true)).toEqual({ turns, trailingReply: null });
  });

  it('copes with an empty conversation', () => {
    expect(holdCardReply([], true)).toEqual({ turns: [], trailingReply: null });
  });
});
