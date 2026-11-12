import { describe, expect, it, vi } from 'vitest';

import {
  clearToolResults,
  composeStrategies,
  estimateMessageTokens,
  evictOldest,
  extendFingerprint,
  fingerprintMessages,
  summarizeOldest,
  withCompaction,
  type Checkpoint,
} from '../compaction.js';

type Msg = {
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  toolCalls?: { id: string; name: string; arguments: string }[];
  toolCallId?: string;
};

const user = (content: string): Msg => ({ role: 'user', content });
const assistant = (content: string): Msg => ({ role: 'assistant', content });

/** An assistant turn that calls a tool, plus the result answering it. */
const toolExchange = (id: string, result: string): Msg[] => [
  {
    role: 'assistant',
    content: null,
    toolCalls: [{ id, name: 'search_highlights', arguments: '{"query":"x"}' }],
  },
  { role: 'tool', content: result, toolCallId: id },
];

const ctx = { maxTokens: 100, estimateTokens: estimateMessageTokens };

/** Nothing may reference a tool call that is no longer present. */
function assertNoOrphanedToolResults(messages: Msg[]) {
  const callIds = new Set(
    messages.flatMap((m) => (m.toolCalls ?? []).map((c) => c.id)),
  );
  for (const message of messages) {
    if (message.role === 'tool' && message.toolCallId) {
      expect(callIds.has(message.toolCallId)).toBe(true);
    }
  }
}

describe('estimateMessageTokens', () => {
  it('counts tool call arguments, which are sent verbatim', () => {
    const plain = estimateMessageTokens(assistant('') as never);
    const withCall = estimateMessageTokens({
      role: 'assistant',
      content: null,
      toolCalls: [{ id: '1', name: 'search', arguments: '{"query":"a long query string"}' }],
    } as never);
    expect(withCall).toBeGreaterThan(plain);
  });
});

describe('evictOldest', () => {
  it('keeps the newest turns and marks what it dropped', () => {
    const messages = [user('one'), assistant('two'), user('three'), assistant('four')];
    const out = evictOldest({ keepRecentTokens: 20 })(messages as never, ctx) as Msg[];

    expect(out).not.toBeNull();
    // The marker replaces the head.
    expect(out[0].role).toBe('user');
    expect(out[0].content).toMatch(/omitted/i);
    // The newest turn always survives.
    expect(out[out.length - 1].content).toBe('four');
  });

  it('never separates a tool result from its call', () => {
    const messages = [
      user('old'),
      ...toolExchange('call-1', 'first result'),
      user('recent'),
      ...toolExchange('call-2', 'second result'),
    ];

    // A budget that would slice mid-exchange if groups were not respected.
    const out = evictOldest({ keepRecentTokens: 25 })(messages as never, ctx) as Msg[];
    expect(out).not.toBeNull();
    assertNoOrphanedToolResults(out);
  });

  it('returns null when nothing would be dropped', () => {
    const messages = [user('only')];
    expect(evictOldest({ keepRecentTokens: 10_000 })(messages as never, ctx)).toBeNull();
  });
});

describe('clearToolResults', () => {
  it('stubs older results and leaves the recent ones intact', () => {
    const messages = [
      ...toolExchange('a', 'AAAA'),
      ...toolExchange('b', 'BBBB'),
      ...toolExchange('c', 'CCCC'),
    ];

    const out = clearToolResults({ keepRecentToolResults: 1 })(messages as never, ctx) as Msg[];
    expect(out).not.toBeNull();

    const results = out.filter((m) => m.role === 'tool');
    expect(results[0].content).toMatch(/omitted/i);
    expect(results[1].content).toMatch(/omitted/i);
    // The most recent keeps its real content.
    expect(results[2].content).toBe('CCCC');
  });

  it('keeps every message and every pairing', () => {
    const messages = [...toolExchange('a', 'AAAA'), ...toolExchange('b', 'BBBB')];
    const out = clearToolResults({ keepRecentToolResults: 0 })(messages as never, ctx) as Msg[];

    expect(out).toHaveLength(messages.length);
    assertNoOrphanedToolResults(out);
  });

  it('returns null when there is nothing older to clear', () => {
    const messages = toolExchange('a', 'AAAA');
    expect(clearToolResults({ keepRecentToolResults: 3 })(messages as never, ctx)).toBeNull();
  });
});

describe('summarizeOldest', () => {
  it('replaces the dropped head with a summary and keeps the tail', async () => {
    const summarize = vi.fn().mockResolvedValue('They discussed Dune, chapter 3.');
    const messages = [user('one'), assistant('two'), user('three'), assistant('four')];

    const out = (await summarizeOldest({ summarize, keepRecentTokens: 20 })(
      messages as never,
      ctx,
    )) as Msg[];

    expect(summarize).toHaveBeenCalledOnce();
    expect(out[0].content).toContain('They discussed Dune');
    expect(out[out.length - 1].content).toBe('four');
  });

  it('leaves history intact when summarizing fails', async () => {
    const summarize = vi.fn().mockRejectedValue(new Error('provider down'));
    const messages = [user('one'), assistant('two'), user('three'), assistant('four')];

    const out = await summarizeOldest({ summarize, keepRecentTokens: 20 })(messages as never, ctx);

    // Failing open: an over-long request is recoverable, silently discarding
    // the conversation is not.
    expect(out).toBeNull();
  });

  /** A store that is just a variable, as one thread's would be. */
  const memoryStore = () => {
    let held: Checkpoint | undefined;
    return { get: () => held, set: (c: Checkpoint) => void (held = c) };
  };
  /** About 16 estimated tokens each. */
  const turn = (i: number): Msg[] => [user(`question ${i} ${'x'.repeat(20)}`), assistant(`answer ${i} ${'y'.repeat(20)}`)];
  const conversation = (n: number) => Array.from({ length: n }, (_, i) => turn(i)).flat();
  /** Room for the summary's label beside a short tail. */
  const roomy = { ...ctx, maxTokens: 150 };

  it('reuses its summary on the next request instead of writing it again', async () => {
    const summarize = vi.fn().mockResolvedValue('Earlier: they asked about Dune.');
    const checkpoints = memoryStore();
    const strategy = summarizeOldest({ summarize, keepRecentTokens: 40, checkpoints });

    await strategy(conversation(8) as never, roomy);
    // The next request: the same conversation and one more exchange.
    const out = (await strategy(conversation(9) as never, roomy)) as Msg[];

    expect(summarize).toHaveBeenCalledOnce();
    expect(out[0].content).toContain('they asked about Dune');
    expect(out[out.length - 1].content).toContain('answer 8');
  });

  it('folds only the new messages into the held summary once it no longer fits', async () => {
    const summarize = vi
      .fn()
      .mockResolvedValueOnce('First note.')
      .mockResolvedValueOnce('Updated note.');
    const checkpoints = memoryStore();
    const strategy = summarizeOldest({ summarize, keepRecentTokens: 40, checkpoints });

    await strategy(conversation(8) as never, roomy);
    const covered = checkpoints.get()!.covered;
    const out = (await strategy(conversation(14) as never, roomy)) as Msg[];

    expect(summarize).toHaveBeenCalledTimes(2);
    const [newMessages, previous] = summarize.mock.calls[1];
    expect(previous).toBe('First note.');
    // Starts where the first summary stopped, not at the beginning.
    expect((newMessages as Msg[])[0].content).toBe(conversation(14)[covered].content);
    expect(out[0].content).toContain('Updated note.');
    expect(checkpoints.get()!.summary).toBe('Updated note.');
  });

  it('carries on from its own summary when one request compacts twice', async () => {
    const summarize = vi
      .fn()
      .mockResolvedValueOnce('First note.')
      .mockResolvedValueOnce('Second note.')
      .mockResolvedValueOnce('Third note.');
    const checkpoints = memoryStore();
    const strategy = summarizeOldest({ summarize, keepRecentTokens: 40, checkpoints });

    // The first step of the agent loop compacts what the app sent.
    const full = conversation(8);
    const first = (await strategy(full as never, roomy)) as Msg[];
    const firstCovered = checkpoints.get()!.covered;
    // TanStack carries on from the compacted messages; a long result arrives.
    const grown = [...first, ...conversation(14).slice(full.length)];
    const second = (await strategy(grown as never, roomy)) as Msg[];

    // Only what followed the first summary was folded in.
    expect(summarize.mock.calls[1][1]).toBe('First note.');
    expect((summarize.mock.calls[1][0] as Msg[])[0].content).toBe(full[firstCovered].content);
    expect(second[0].content).toContain('Second note.');

    // The checkpoint describes the conversation the app sends next time.
    const next = conversation(15);
    const covered = checkpoints.get()!.covered;
    expect(fingerprintMessages(next.slice(0, covered) as never)).toBe(checkpoints.get()!.fingerprint);
    const third = (await strategy(next as never, roomy)) as Msg[];
    expect(third[0].content).toContain('Second note.');
    expect(summarize).toHaveBeenCalledTimes(2);
  });

  it('starts again when the conversation is not the one the summary was written for', async () => {
    const summarize = vi.fn().mockResolvedValue('A note.');
    const checkpoints = memoryStore();
    const strategy = summarizeOldest({ summarize, keepRecentTokens: 40, checkpoints });

    await strategy(conversation(8) as never, roomy);
    const edited = conversation(9);
    edited[0] = user('a different first question');
    await strategy(edited as never, roomy);

    expect(summarize).toHaveBeenCalledTimes(2);
    expect(summarize.mock.calls[1][1]).toBeNull();
  });

  it('keeps the held summary when folding in new messages fails', async () => {
    const summarize = vi.fn().mockResolvedValueOnce('First note.').mockRejectedValueOnce(new Error('down'));
    const checkpoints = memoryStore();
    const strategy = summarizeOldest({ summarize, keepRecentTokens: 40, checkpoints });

    await strategy(conversation(8) as never, roomy);
    const out = (await strategy(conversation(14) as never, roomy)) as Msg[];

    expect(out[0].content).toContain('First note.');
  });

  it('does not summarize when nothing would be dropped', async () => {
    const summarize = vi.fn();
    const out = await summarizeOldest({ summarize, keepRecentTokens: 10_000 })(
      [user('only')] as never,
      ctx,
    );
    expect(out).toBeNull();
    expect(summarize).not.toHaveBeenCalled();
  });
});

describe('fingerprintMessages', () => {
  it('can be carried on from where an earlier one stopped', () => {
    const a = [user('one'), assistant('two')];
    const b = [user('three'), assistant('four')];
    expect(extendFingerprint(fingerprintMessages(a as never), b as never)).toBe(
      fingerprintMessages([...a, ...b] as never),
    );
  });

  it('tells apart the same words said by someone else', () => {
    expect(fingerprintMessages([user('hi')] as never)).not.toBe(fingerprintMessages([assistant('hi')] as never));
  });
});

describe('composeStrategies', () => {
  it('stops as soon as the result is under budget', async () => {
    const second = vi.fn().mockReturnValue([user('never reached')] as never);
    // A tiny transcript that the first strategy already brings under budget.
    const first = () => [user('tiny')] as never;

    const messages = [user('x'.repeat(2000)), assistant('y'.repeat(2000))];
    const out = await composeStrategies(first, second)(messages as never, {
      maxTokens: 100,
      estimateTokens: estimateMessageTokens,
    });

    expect(out).not.toBeNull();
    expect(second).not.toHaveBeenCalled();
  });

  it('escalates when the cheaper strategy was not enough', async () => {
    const fallback = vi.fn().mockReturnValue([user('small')] as never);
    // Returns something still far over budget.
    const ineffective = () => [user('z'.repeat(4000))] as never;

    const messages = [user('x'.repeat(4000))];
    await composeStrategies(ineffective, fallback)(messages as never, {
      maxTokens: 50,
      estimateTokens: estimateMessageTokens,
    });

    expect(fallback).toHaveBeenCalledOnce();
  });
});

describe('withCompaction', () => {
  const runConfig = async (middleware: ReturnType<typeof withCompaction>, messages: Msg[]) =>
    middleware.onConfig?.({} as never, {
      messages: messages as never,
      systemPrompts: [],
      tools: [],
    });

  it('does nothing while the conversation fits', async () => {
    const strategy = vi.fn();
    const middleware = withCompaction({ maxTokens: 10_000, strategy });

    const result = await runConfig(middleware, [user('short')]);

    expect(strategy).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('replaces messages once over budget and reports what it did', async () => {
    const onCompact = vi.fn();
    const middleware = withCompaction({
      maxTokens: 50,
      strategy: () => [user('compacted')] as never,
      onCompact,
    });

    const result = (await runConfig(middleware, [
      user('x'.repeat(4000)),
      assistant('y'.repeat(4000)),
    ])) as { messages: Msg[] };

    expect(result.messages).toHaveLength(1);
    expect(onCompact).toHaveBeenCalledOnce();
    const info = onCompact.mock.calls[0][0];
    expect(info.messagesBefore).toBe(2);
    expect(info.messagesAfter).toBe(1);
    expect(info.after).toBeLessThan(info.before);
  });

  it('passes through when the strategy declines to change anything', async () => {
    const middleware = withCompaction({ maxTokens: 50, strategy: () => null });
    const result = await runConfig(middleware, [user('x'.repeat(4000))]);
    expect(result).toBeUndefined();
  });
});
