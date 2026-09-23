import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The conversation is exercised against a fake runner with the native one's
 * contract: a fixed window it refuses to write past (with ExecuTorch's
 * InvalidArgument), prefill and generate that advance the position, and a
 * rewind to any earlier position. The chat template is a toy one that keeps
 * the property the real ones are checked for: each message renders the same
 * whether or not more follow.
 */

type Msg = { role: string; content?: unknown; toolCalls?: readonly unknown[] };

const tokens = (text: string) => Math.ceil(text.length / 4);

class FakeRunner {
  pos = 0;
  log: string[] = [];
  /** A reply is text, streamed three characters a token, or its exact tokens. */
  replies: (string | string[])[] = [];
  onGenerate: (() => void) | null = null;
  stopped = false;
  constructor(public max: number) {}

  prefill = (text: string) => {
    const n = tokens(text);
    if (this.pos + n >= this.max) throw overflow();
    this.pos += n;
    this.log.push(`prefill:${text}`);
  };

  configs: unknown[] = [];

  generate = (prompt: string, config: unknown, onToken?: (t: string) => void) => {
    this.configs.push(config);
    this.prefill(prompt);
    this.stopped = false;
    this.onGenerate?.();
    const reply = this.replies.shift() ?? '';
    const pieces = Array.isArray(reply) ? reply : (reply.match(/.{1,3}/gs) ?? []);
    // As the native runner does: every token is handed back, but the last one
    // sampled is never fed to the model, so it is not in the cache.
    let unfed = '';
    for (const ch of pieces) {
      if (this.stopped) break;
      this.pos += tokens(unfed);
      onToken?.(ch);
      unfed = ch;
    }
    return {};
  };

  resets: number[] = [];

  reset = (target = 0) => {
    if (target > this.pos) throw new Error('reset out of range');
    this.resets.push(target);
    this.pos = target;
  };

  getKVCacheState = () => ({
    pos: this.pos,
    maxSeqLen: this.max,
    remainingTokens: this.max - this.pos,
    usageRatio: this.pos / this.max,
  });

  stop = () => {
    this.stopped = true;
  };

  disposed = false;
  dispose = () => {
    this.disposed = true;
  };
}

function overflow() {
  return Object.assign(new Error('LLMRunner.prefill: Failed: InvalidArgument'), {
    name: 'RnExecuTorchError',
    code: 'EXECUTION_FAILED',
    etRuntimeErrorCode: 0x12,
  });
}

function renderAll(messages: readonly Msg[], addGenPrompt: boolean) {
  const body = messages
    .map((m) => `<${m.role}>${String(m.content ?? '')}${m.toolCalls ? JSON.stringify(m.toolCalls) : ''}</${m.role}>\n`)
    .join('');
  return body + (addGenPrompt ? '<assistant>' : '');
}

const fakePreprocessor = {
  process(history: readonly Msg[], lastK: number, opts?: { addGenPrompt?: boolean }) {
    const addGen = opts?.addGenPrompt ?? true;
    if (lastK === history.length) return renderAll(history, addGen);
    const prefix = renderAll(history.slice(0, history.length - lastK), false);
    return renderAll(history, addGen).slice(prefix.length);
  },
  clear() {},
  dispose() {},
};

let runner = new FakeRunner(4096);
/** Runners handed out, in order, before falling back to `runner`. */
const nextRunners: FakeRunner[] = [];

vi.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...a: unknown[]) => void, ...args: unknown[]) => fn(...args),
}));
/** The toy tokenizer's special tokens: an end of turn, an end of text, and a tool-call opener. */
const TOKENIZER_CONFIG = JSON.stringify({
  eos_token: '<eos>',
  added_tokens_decoder: {
    '1': { content: '<eos>', special: true },
    '106': { content: '<turn|>', special: true },
    '48': { content: '<|tool_call>', special: true },
  },
});
vi.mock('react-native-blob-util', () => ({ default: { fs: { readFile: async () => TOKENIZER_CONFIG } } }));
vi.mock('@/lib/executorch', () => ({
  getExecuTorch: () => ({
    wrapAsync:
      <A extends unknown[], R>(fn: (...args: A) => R) =>
      async (...args: A) =>
        fn(...args),
    isRnExecuTorchError: (e: unknown) => (e as { name?: string })?.name === 'RnExecuTorchError',
    llm: {
      parseTokenizerConfig: () => ({ chatTemplate: 'toy', eosToken: '<eos>' }),
      createLLMRunner: () => nextRunners.shift() ?? runner,
      createChatPreprocessor: () => fakePreprocessor,
    },
  }),
}));

const { chunkForPrefill, ContextPressureError, createConversation } = await import('../conversation');
const { getEngine, isEngineLoaded, loadEngine, unloadEngine } = await import('../engine');

const FILES = { modelPath: 'm.pte', tokenizerPath: 't.json', tokenizerConfigPath: 'c.json' };
const ENTRY = { id: 'toy', name: 'Toy', family: 'GEMMA4_E2B', variant: 'XNNPACK_8DA4W' } as const;

async function freshEngine(max = 4096) {
  runner = new FakeRunner(max);
  await loadEngine(ENTRY, FILES);
}

const replyOf = (turn: { messages: readonly Msg[] }) => turn.messages[turn.messages.length - 1];

/** A tool format whose calls read `CALL name {json}`. */
const toyFormat = {
  parse(text: string) {
    const m = /CALL (\w+) (\{.*\})/.exec(text);
    if (!m) return undefined;
    return { toolCalls: [{ type: 'function', function: { name: m[1], arguments: JSON.parse(m[2]) } }] };
  },
  stopRegex: /\}$/,
  keepTokens: [] as string[],
  visible: (text: string) => text.split('CALL')[0],
};

describe('chunkForPrefill', () => {
  it('passes short text through whole, and nothing for nothing', () => {
    expect(chunkForPrefill('hello', 10)).toEqual(['hello']);
    expect(chunkForPrefill('', 10)).toEqual([]);
  });

  it('breaks at line ends, never past the limit, and loses nothing', () => {
    const text = Array.from({ length: 40 }, (_, i) => `<|turn>line ${i}`).join('\n');
    const chunks = chunkForPrefill(text, 60);
    expect(chunks.join('')).toBe(text);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(60);
    for (const c of chunks.slice(0, -1)) expect(c.endsWith('\n')).toBe(true);
  });

  it('cuts mid-line only when a line is longer than the limit', () => {
    const chunks = chunkForPrefill('x'.repeat(25), 10);
    expect(chunks).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)]);
  });
});

describe('createConversation', () => {
  beforeEach(async () => {
    await freshEngine();
  });

  it('answers a message and keeps the turn in its history', async () => {
    const convo = createConversation({ systemPrompt: 'You are Samwell.' });
    runner.replies.push('Hello, reader.');

    const seen: string[] = [];
    const turn = await convo.sendMessage('Hi', { onText: (t) => seen.push(t) });

    expect(replyOf(turn)).toEqual({ role: 'assistant', content: 'Hello, reader.' });
    expect(turn.finishReason).toBe('stop');
    expect(seen[seen.length - 1]).toBe('Hello, reader.');
    expect(convo.getHistory().map((m) => m.role)).toEqual(['system', 'user', 'assistant']);
    // The system prompt went in first, on its own, so its cost is the baseline.
    expect(runner.log[0]).toBe('prefill:<system>You are Samwell.</system>\n');
    expect(convo.context()?.baseline).toBe(tokens('<system>You are Samwell.</system>\n'));
  });

  it('only prefills what is new on the next turn', async () => {
    const convo = createConversation({ systemPrompt: 'S' });
    runner.replies.push('one', 'two');
    await convo.sendMessage('first');
    runner.log = [];
    await convo.sendMessage('second');
    expect(runner.log[0]).toBe('prefill:<user>second</user>\n');
  });

  it('runs a tool, feeds the result back, and answers from it', async () => {
    const execute = vi.fn(async (args: Record<string, unknown>) => `found ${String(args.q)}`);
    const convo = createConversation({
      systemPrompt: 'S',
      tools: [{ type: 'function', function: { name: 'search' }, execute }],
      toolFormat: toyFormat,
    });
    runner.replies.push('CALL search {"q":"courage"}', 'Courage is a habit.');

    const steps: number[] = [];
    const turn = await convo.sendMessage('What did I save?', { onText: (_t, step) => steps.push(step) });

    expect(execute).toHaveBeenCalledWith({ q: 'courage' });
    expect(turn.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    expect(turn.messages[2]).toMatchObject({ role: 'tool', name: 'search', content: 'found courage' });
    expect(replyOf(turn)).toEqual({ role: 'assistant', content: 'Courage is a habit.' });
    expect(new Set(steps)).toEqual(new Set([0, 1]));
  });

  it('gives no tools to a conversation without a format to read them', async () => {
    const execute = vi.fn(async () => 'x');
    const convo = createConversation({ tools: [{ type: 'function', function: { name: 'search' }, execute }] });
    runner.replies.push('CALL search {"q":"x"}');
    const turn = await convo.sendMessage('go');
    expect(execute).not.toHaveBeenCalled();
    expect(replyOf(turn).content).toBe('CALL search {"q":"x"}');
  });

  it('cuts a turn off after its steps run out', async () => {
    const convo = createConversation({
      tools: [{ type: 'function', function: { name: 'search' }, execute: async () => 'r' }],
      toolFormat: toyFormat,
      maxToolTurns: 2,
    });
    runner.replies.push('CALL search {}', 'CALL search {}', 'never reached');
    const turn = await convo.sendMessage('loop');
    expect(turn.finishReason).toBe('maxToolTurns');
  });

  it('rebuilds its history when another conversation used the cache in between', async () => {
    const a = createConversation({ systemPrompt: 'A' });
    const b = createConversation({ systemPrompt: 'B' });
    runner.replies.push('a1', 'b1', 'a2');

    await a.sendMessage('to a');
    await b.sendMessage('to b');
    expect(a.context()).toBeNull();

    runner.log = [];
    await a.sendMessage('to a again');
    expect(runner.log[0]).toBe('prefill:<system>A</system>\n');
    expect(runner.log[1]).toBe('prefill:<user>to a</user>\n<assistant>a1</assistant>\n');
    expect(a.getHistory().map((m) => m.content)).toEqual(['A', 'to a', 'a1', 'to a again', 'a2']);
  });

  it('refuses a turn no compaction could fit, before writing anything', async () => {
    await freshEngine(512);
    const convo = createConversation({ systemPrompt: 'S' });
    await expect(convo.sendMessage('x'.repeat(4000))).rejects.toMatchObject({ pressure: 'full' });
    expect(convo.getHistory().map((m) => m.role)).toEqual(['system']);
  });

  it('asks for compaction when the history has filled the window', async () => {
    await freshEngine(512);
    const convo = createConversation({ systemPrompt: 'S' });
    convo.reseed([
      { role: 'user', content: 'u'.repeat(700) },
      { role: 'assistant', content: 'a'.repeat(700) },
    ]);
    const err = await convo.sendMessage('next').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ContextPressureError);
    expect((err as InstanceType<typeof ContextPressureError>).pressure).toBe('compact');

    // A reseed with less history makes room, as the chat store does.
    convo.reseed([]);
    runner.replies.push('ok');
    expect(replyOf(await convo.sendMessage('next')).content).toBe('ok');
  });

  it('rolls history and cache back when a turn fails', async () => {
    const convo = createConversation({ systemPrompt: 'S' });
    runner.replies.push('one');
    await convo.sendMessage('first');
    const pos = runner.pos;

    runner.onGenerate = () => {
      throw new Error('native failure');
    };
    await expect(convo.sendMessage('second')).rejects.toThrow('native failure');
    expect(convo.getHistory().map((m) => m.content)).toEqual(['S', 'first', 'one']);
    expect(runner.pos).toBe(pos);
  });

  it('does not start the model again when stopped while a tool runs', async () => {
    let convo: ReturnType<typeof createConversation> | null = null;
    convo = createConversation({
      tools: [
        {
          type: 'function',
          function: { name: 'search' },
          execute: async () => {
            convo?.stop();
            return 'r';
          },
        },
      ],
      toolFormat: toyFormat,
    });
    runner.replies.push('CALL search {}', 'must not be generated');
    const turn = await convo.sendMessage('go');
    expect(turn.finishReason).toBe('stopped');
    expect(runner.replies).toEqual(['must not be generated']);
  });

  it('keeps a reply that filled the window, and rebuilds on the next turn', async () => {
    // The generation clamps itself to the window; closing the turn in the
    // cache is what overflows.
    await freshEngine(400);
    const convo = createConversation({ systemPrompt: 'S' });
    runner.replies.push('r'.repeat(1580));
    const turn = await convo.sendMessage('hi');
    expect(replyOf(turn).content).toBe('r'.repeat(1580));
    expect(convo.context()).toBeNull();

    runner.replies.push('still here');
    runner.log = [];
    // Rebuilding that history overflows too, and says so as a compaction,
    // which the caller can act on, not as a native failure it cannot.
    const err = await convo.sendMessage('again').catch((e: unknown) => e);
    expect(runner.log[0]).toBe('prefill:<system>S</system>\n');
    expect(err).toBeInstanceOf(ContextPressureError);
    expect(err).toMatchObject({ pressure: 'compact', snapshot: { max: 400 } });
    expect(convo.getHistory().map((m) => m.role)).toEqual(['system', 'user', 'assistant']);

    convo.reseed([]);
    expect(replyOf(await convo.sendMessage('again')).content).toBe('still here');
  });

  it('takes a message back whole when stopped before the model said anything', async () => {
    const convo = createConversation({ systemPrompt: 'S' });
    runner.replies.push('one');
    await convo.sendMessage('first');
    const pos = runner.pos;

    const pending = convo.sendMessage('second');
    convo.stop();
    const turn = await pending;
    expect(turn).toEqual({ messages: [], finishReason: 'stopped' });
    expect(convo.getHistory().map((m) => m.content)).toEqual(['S', 'first', 'one']);
    expect(runner.pos).toBe(pos);
  });

  it('keeps only the shown part of a reply stopped halfway through a call', async () => {
    let convo: ReturnType<typeof createConversation> | null = null;
    convo = createConversation({
      tools: [{ type: 'function', function: { name: 'search' }, execute: async () => 'r' }],
      toolFormat: toyFormat,
    });
    runner.replies.push('Let me look. CALL search {"q":"x"}');
    const turn = await convo.sendMessage('go', {
      onText: (t) => {
        if (t.includes('CALL')) convo?.stop();
      },
    });
    expect(turn.finishReason).toBe('stopped');
    expect(replyOf(turn).content).toBe('Let me look.');
  });

  it('never stops a generation that belongs to another conversation', async () => {
    const a = createConversation({ systemPrompt: 'A' });
    const b = createConversation({ systemPrompt: 'B' });
    runner.replies.push('the whole of b');
    const turn = await b.sendMessage('to b', { onText: () => a.stop() });
    expect(replyOf(turn).content).toBe('the whole of b');
  });

  it('never echoes the prompt back as the start of the reply', async () => {
    runner.replies.push('Hello.');
    await createConversation().sendMessage('Hi');
    expect(runner.configs[0]).toMatchObject({ echo: false });
  });

  it('leaves every end token out of the reply, not only the eos token', async () => {
    runner.replies.push(['Hello', '.', '<turn|>'], ['Bye', '<eos>']);
    const convo = createConversation();
    const seen: string[] = [];
    const first = await convo.sendMessage('Hi', { onText: (t) => seen.push(t) });
    expect(replyOf(first).content).toBe('Hello.');
    expect(seen.join('')).not.toContain('<turn|>');
    expect(replyOf(await convo.sendMessage('Go')).content).toBe('Bye');
  });

  it('keeps the special tokens a tool call is written in', async () => {
    const format = { ...toyFormat, keepTokens: ['<|tool_call>'], parse: vi.fn(() => undefined) };
    const convo = createConversation({
      tools: [{ type: 'function', function: { name: 'search' }, execute: async () => 'r' }],
      toolFormat: format,
    });
    runner.replies.push(['<|tool_call>', 'call', '<turn|>']);
    await convo.sendMessage('go');
    expect(format.parse).toHaveBeenCalledWith('<|tool_call>call');
  });

  it('shows reasoning as it streams, and keeps it out of the history', async () => {
    runner.replies.push('<think>weighing it</think>Hello.');
    const convo = createConversation();
    const seen: string[] = [];
    const turn = await convo.sendMessage('Hi', { onText: (t) => seen.push(t) });
    expect(seen[seen.length - 1]).toBe('<think>weighing it</think>Hello.');
    expect(replyOf(turn).content).toBe('Hello.');
    expect(convo.getHistory().map((m) => m.content)).toEqual(['Hi', 'Hello.']);
  });

  it('caps a reply at the reserve, and lower when asked', async () => {
    await freshEngine(2048);
    runner.replies.push('a', 'b');
    await createConversation().sendMessage('x');
    await createConversation({ maxNewTokens: 96 }).sendMessage('y');
    await expect(createConversation({ maxNewTokens: 99_999 }).sendMessage('z')).resolves.toBeDefined();
    expect(runner.configs.map((c) => (c as { maxNewTokens: number }).maxNewTokens)).toEqual([512, 96, 512]);
  });

  it('refuses turns once a different model is loaded', async () => {
    const convo = createConversation({ systemPrompt: 'S' });
    await freshEngine();
    await expect(convo.sendMessage('hi')).rejects.toThrow('No model loaded');
  });

  it('serializes turns from different conversations on the one runner', async () => {
    const a = createConversation({ systemPrompt: 'A' });
    const b = createConversation({ systemPrompt: 'B' });
    runner.replies.push('a1', 'b1');
    const [ta, tb] = await Promise.all([a.sendMessage('to a'), b.sendMessage('to b')]);
    expect(replyOf(ta).content).toBe('a1');
    expect(replyOf(tb).content).toBe('b1');
  });
});

describe('engine', () => {
  it('does not bring a model back that was unloaded while it loaded', async () => {
    runner = new FakeRunner(4096);
    const loading = loadEngine(ENTRY, FILES);
    const unloading = unloadEngine();
    await Promise.all([loading, unloading]);
    expect(isEngineLoaded()).toBe(false);
  });

  it('keeps the newest of two loads, and frees the other', async () => {
    const first = new FakeRunner(1000);
    const second = new FakeRunner(2000);
    nextRunners.push(first, second);
    await Promise.all([loadEngine(ENTRY, FILES), loadEngine(ENTRY, FILES)]);
    expect(getEngine()?.runner).toBe(second);
    expect(first.disposed).toBe(true);
    expect(second.disposed).toBe(false);
  });

  it('frees a model unloaded while it loaded', async () => {
    const loaded = new FakeRunner(1000);
    nextRunners.push(loaded);
    await Promise.all([loadEngine(ENTRY, FILES), unloadEngine()]);
    expect(loaded.disposed).toBe(true);
  });
});

describe('a cache that cannot be rewound', () => {
  const STICKY = { ...ENTRY, rewindableCache: false } as const;

  async function stickyEngine() {
    runner = new FakeRunner(4096);
    await loadEngine(STICKY, FILES);
  }

  it('reloads the decoder, not a reset, when another conversation takes the cache', async () => {
    await stickyEngine();
    const first = runner;
    const a = createConversation({ systemPrompt: 'A' });
    const b = createConversation({ systemPrompt: 'B' });
    first.replies.push('a1');
    await a.sendMessage('to a');

    const second = new FakeRunner(4096);
    second.replies.push('b1');
    nextRunners.push(second);
    const turn = await b.sendMessage('to b');

    expect(first.disposed).toBe(true);
    expect(getEngine()?.runner).toBe(second);
    expect(replyOf(turn).content).toBe('b1');
    expect(first.resets.filter((p) => p > 0)).toEqual([]);
  });

  it('does not reload a model it has only just loaded', async () => {
    await stickyEngine();
    const loaded = runner;
    loaded.replies.push('hello');
    await createConversation({ systemPrompt: 'S' }).sendMessage('hi');
    expect(loaded.disposed).toBe(false);
    expect(getEngine()?.runner).toBe(loaded);
  });

  it('runs a tool round without taking a token back', async () => {
    await stickyEngine();
    const convo = createConversation({
      tools: [{ type: 'function', function: { name: 'search' }, execute: async () => 'r' }],
      toolFormat: toyFormat,
    });
    runner.replies.push('CALL search {}', 'Found it.');
    const turn = await convo.sendMessage('go');
    expect(replyOf(turn).content).toBe('Found it.');
    expect(runner.resets.filter((p) => p > 0)).toEqual([]);
  });

  it('starts clean after a reply is stopped, rather than rewinding', async () => {
    await stickyEngine();
    const convo = createConversation({ systemPrompt: 'S' });
    runner.replies.push('first answer');
    await convo.sendMessage('one');

    const pending = convo.sendMessage('two');
    convo.stop();
    await pending;

    const clean = new FakeRunner(4096);
    clean.replies.push('fresh');
    nextRunners.push(clean);
    const turn = await convo.sendMessage('three');
    expect(getEngine()?.runner).toBe(clean);
    expect(replyOf(turn).content).toBe('fresh');
    expect(convo.getHistory().map((m) => m.content)).toEqual(['S', 'one', 'first answer', 'three', 'fresh']);
  });

  it('keeps text written before a call, and goes on without a rebuild', async () => {
    await stickyEngine();
    const loaded = runner;
    const convo = createConversation({
      systemPrompt: 'S',
      tools: [{ type: 'function', function: { name: 'search' }, execute: async () => 'r' }],
      toolFormat: toyFormat,
    });
    // The history keeps none of the text before the call, as Gemma's template does not.
    loaded.replies.push(['Let me look. ', 'CALL search {', '}'], ['Found it', '.'], ['Sure', '.']);
    await convo.sendMessage('go');
    await convo.sendMessage('thanks');

    expect(loaded.disposed).toBe(false);
    expect(loaded.resets.filter((p) => p > 0)).toEqual([]);
    expect(loaded.log.filter((l) => l.includes('<system>'))).toHaveLength(1);
    // The results go on from the call's last token, and a reply closes with the template's closer.
    expect(loaded.log).toContain('prefill:}]</assistant>\n<tool>r</tool>\n<assistant>');
    expect(loaded.log).toContain('prefill:.</assistant>\n');
  });

  it('closes a reply with reasoning in it without a rebuild', async () => {
    await stickyEngine();
    const loaded = runner;
    const convo = createConversation({ systemPrompt: 'S' });
    loaded.replies.push(['<think>', 'hmm', '</think>', 'Answer'], ['Next']);
    await convo.sendMessage('q');
    await convo.sendMessage('again');

    expect(loaded.disposed).toBe(false);
    expect(loaded.log.filter((l) => l.includes('<system>'))).toHaveLength(1);
    expect(loaded.log).toContain('prefill:Answer</assistant>\n');
    expect(convo.getHistory().map((m) => m.content)).toEqual(['S', 'q', 'Answer', 'again', 'Next']);
  });
});

describe('a turn that the template agrees with', () => {
  it('appends what the template adds and never rewinds', async () => {
    await freshEngine();
    const convo = createConversation({ systemPrompt: 'S' });
    runner.replies.push('one', 'two');
    await convo.sendMessage('first');
    await convo.sendMessage('second');
    expect(runner.resets.filter((p) => p > 0)).toEqual([]);
  });

  it('takes the cache back when the model wrote what the history leaves out', async () => {
    await freshEngine();
    const convo = createConversation({ systemPrompt: 'S' });
    runner.replies.push('<think>hmm</think>Answer');
    await convo.sendMessage('q');
    // The reasoning is not in the history, so the cache is rewound to the end
    // of the question and the answer written as the template writes it.
    expect(runner.resets.some((p) => p > 0)).toBe(true);
    expect(runner.log[runner.log.length - 1]).toBe('prefill:<assistant>Answer</assistant>\n');
  });
});

describe('thinking', () => {
  const QWEN = { ...ENTRY, family: 'QWEN3_1_7B', variant: 'XNNPACK_8DA4W', thinking: 'switch' } as const;

  it("tells a brain that reasons by default not to, unless asked, in its instructions", async () => {
    runner = new FakeRunner(4096);
    await loadEngine(QWEN, FILES);
    runner.replies.push('a', 'b');
    await createConversation({ systemPrompt: 'S' }).sendMessage('x');
    expect(runner.log[0]).toBe('prefill:<system>S\n\n/no_think</system>\n');

    runner.log = [];
    await createConversation({ systemPrompt: 'S', thinking: true }).sendMessage('y');
    expect(runner.log[0]).toBe('prefill:<system>S\n\n/think</system>\n');
  });

});

describe('oneShot', () => {
  it('stops when its signal fires, and says so', async () => {
    await freshEngine();
    const { oneShot, OneShotAborted } = await import('../one-shot');
    const controller = new AbortController();
    runner.replies.push('a long answer that never gets to finish');
    runner.onGenerate = () => controller.abort();
    await expect(oneShot({ instructions: 'Title it.', input: 'text' }, { signal: controller.signal })).rejects.toBeInstanceOf(
      OneShotAborted,
    );
    runner.onGenerate = null;
  });
});
