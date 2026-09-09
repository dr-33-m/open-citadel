import { describe, expect, it } from 'vitest';

import {
  TOOL_LOOP_CEILING,
  TOOL_LOOP_WINDOW_MS,
  admitRequest,
  sweepTurns,
  turnKey,
  type TurnStore,
} from '../tool-loop.js';

const ACCOUNT = 'account:reader';

function run(store: TurnStore, key: string, requests: number, startMs = 0) {
  // One user message, then `requests - 1` continuations, all inside the window.
  const results = [];
  for (let i = 0; i < requests; i += 1) {
    results.push(admitRequest(store, key, i === 0, startMs + i * 100));
  }
  return results;
}

describe('tool loop ceiling', () => {
  it('lets an ordinary turn through untouched', () => {
    const store: TurnStore = new Map();
    const results = run(store, turnKey(ACCOUNT, 'thread-1'), 4);
    expect(results.every((r) => r.allowed)).toBe(true);
  });

  it('refuses past the ceiling', () => {
    const store: TurnStore = new Map();
    const results = run(store, turnKey(ACCOUNT, 'thread-1'), TOOL_LOOP_CEILING + 3);
    const allowed = results.filter((r) => r.allowed).length;
    // The reader's message plus exactly `ceiling` continuations.
    expect(allowed).toBe(TOOL_LOOP_CEILING + 1);
    expect(results.at(-1)?.allowed).toBe(false);
  });

  it('bounds the worst turn seen in real traffic', () => {
    // 112 requests in one message is what actually happened, and is the case
    // this whole module exists for.
    const store: TurnStore = new Map();
    const results = run(store, turnKey(ACCOUNT, 'thread-1'), 112);
    expect(results.filter((r) => r.allowed)).toHaveLength(TOOL_LOOP_CEILING + 1);
  });

  it('does not hand a spent turn a fresh allowance on retry', () => {
    const store: TurnStore = new Map();
    const key = turnKey(ACCOUNT, 'thread-1');
    run(store, key, TOOL_LOOP_CEILING + 2);
    expect(admitRequest(store, key, false, 5_000).allowed).toBe(false);
    expect(admitRequest(store, key, false, 5_100).allowed).toBe(false);
  });

  it('starts fresh when the reader speaks again', () => {
    const store: TurnStore = new Map();
    const key = turnKey(ACCOUNT, 'thread-1');
    run(store, key, TOOL_LOOP_CEILING + 2);
    // A new message is a new turn, however long the last one ran.
    expect(admitRequest(store, key, true, 6_000)).toEqual({ allowed: true, continuations: 0 });
  });

  it('starts fresh once a turn has gone idle for the window', () => {
    // Idle, not old. A client that stopped asking two minutes ago has moved
    // on, and the next request on that thread is a new message in all but
    // name.
    const store: TurnStore = new Map();
    const key = turnKey(ACCOUNT, 'thread-1');
    run(store, key, TOOL_LOOP_CEILING + 2);
    const lastTouch = (TOOL_LOOP_CEILING + 1) * 100;
    expect(admitRequest(store, key, false, lastTouch + TOOL_LOOP_WINDOW_MS + 1).allowed).toBe(true);
  });

  it('does not hand a slow turn a fresh allowance while it is still running', () => {
    // The case that matters most, because slow means expensive: on a frontier
    // model a round trip can take ten seconds, so a turn reaches the window
    // long before it reaches the ceiling. If the window were measured from
    // when the turn STARTED rather than from when it was last seen, an active
    // turn would reset its own count every two minutes and run forever.
    const store: TurnStore = new Map();
    const key = turnKey(ACCOUNT, 'thread-1');
    admitRequest(store, key, true, 0);

    let allowed = 0;
    // Forty continuations, ten seconds apart: six and a half minutes of one
    // message, well past several windows.
    for (let i = 1; i <= 40; i += 1) {
      if (admitRequest(store, key, false, i * 10_000).allowed) allowed += 1;
    }
    expect(allowed).toBe(TOOL_LOOP_CEILING);
  });

  it('counts each thread separately', () => {
    const store: TurnStore = new Map();
    run(store, turnKey(ACCOUNT, 'thread-1'), TOOL_LOOP_CEILING + 2);
    expect(admitRequest(store, turnKey(ACCOUNT, 'thread-2'), false, 900).allowed).toBe(true);
  });

  it('counts each account separately on the same thread id', () => {
    const store: TurnStore = new Map();
    run(store, turnKey('account:a', 'thread-1'), TOOL_LOOP_CEILING + 2);
    expect(admitRequest(store, turnKey('account:b', 'thread-1'), false, 900).allowed).toBe(true);
  });

  it('never refuses a request that cannot be grouped', () => {
    // No thread id means nothing to attribute a loop to, and refusing on
    // somebody else's count would be worse than letting one through.
    const store: TurnStore = new Map();
    const key = turnKey(ACCOUNT, undefined);
    expect(admitRequest(store, key, true, 0).allowed).toBe(true);
  });

  it('sweeps turns nothing has touched, and keeps live ones', () => {
    const store: TurnStore = new Map();
    admitRequest(store, turnKey(ACCOUNT, 'old'), true, 0);
    admitRequest(store, turnKey(ACCOUNT, 'live'), true, TOOL_LOOP_WINDOW_MS);
    expect(sweepTurns(store, TOOL_LOOP_WINDOW_MS + 1)).toBe(1);
    expect(store.has(turnKey(ACCOUNT, 'live'))).toBe(true);
  });
});
