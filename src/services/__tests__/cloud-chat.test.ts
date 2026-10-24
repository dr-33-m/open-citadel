import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * A turn the server fails after it has opened the stream. It can no longer
 * answer with an error status, so it sends `RUN_ERROR` inside a 200. The app
 * used to miss that and wait out the two-minute inactivity window with the orb
 * running, then end the turn with nothing said.
 */

const at = Date.now();
let runs: unknown[][] = [];
/** In a scripted run: the connection fails at this point, as XHR reports it. */
const DROP = Symbol('drop');

vi.mock('@tanstack/ai-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/ai-client')>();
  return {
    ...actual,
    // The real client, fed a scripted stream instead of the network.
    xhrHttpStream: () =>
      actual.stream(async function* () {
        for (const chunk of runs.shift() ?? []) {
          if (chunk === DROP) throw new Error('XHR request failed');
          yield chunk as never;
        }
      }),
  };
});
vi.mock('@/components/toast/toast-provider', () => ({ showToast: vi.fn() }));
vi.mock('@/components/icons', () => ({ ArrowRight: () => null }));
vi.mock('@/lib/network', () => ({
  reportCloudReached: () => {},
  reportCloudUnreached: () => {},
  waitForConnection: async () => true,
}));
// Retried at once: the waits are `backoff.ts`'s business and tested there.
vi.mock('@/utils/backoff', () => ({ retryDelayMs: () => 0 }));
vi.mock('@/services/cloud-identity', () => ({ cloudHeaders: async () => ({}) }));
vi.mock('@/services/chat-tools', () => ({ toolStatus: () => 'Working on it…' }));
vi.mock('@/services/compass-tools', () => ({}));
vi.mock('@/services/listening-tools', () => ({}));
vi.mock('@/services/journey', () => ({}));
vi.mock('@/services/onboarding-tools/client-tools', () => ({ createOnboardingClientTools: () => undefined }));
vi.mock('@/stores/approval', () => ({
  useApprovalStore: { getState: () => ({ clearSession: () => {}, requestApproval: async () => false }) },
}));
vi.mock('@/stores/settings', () => ({ useSettingsStore: { getState: () => ({ cloudThinkingBudget: 'low' }) } }));

const { showToast } = await import('@/components/toast/toast-provider');
const { CloudUnreachable, hasPendingToolCall, sayCloudTurnFailed, sendCloudChatTurn } = await import('@/services/cloud-chat');

const started = { type: 'RUN_STARTED', runId: 'r1', threadId: 't', timestamp: at };
const failed = { type: 'RUN_ERROR', runId: 'r1', message: 'Provider returned error', timestamp: at };
const said = (text: string) => [
  { type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant', timestamp: at },
  { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: text, timestamp: at },
];

function turn() {
  return sendCloudChatTurn({
    baseUrl: 'https://cloud.test',
    modelId: 'test-model',
    sessionId: 's1',
    bookId: null,
    mode: 'onboarding',
    history: [],
    content: 'Hello',
    onStreamingContent: () => {},
    onThinkingContent: () => {},
    onToolStatus: () => {},
  });
}

beforeEach(() => {
  vi.mocked(showToast).mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubGlobal('fetch', async () => ({ ok: true, status: 200 }));
});

describe('a turn that fails inside its stream', () => {
  it('ends at once and says so', async () => {
    runs = [[started, failed]];
    const t0 = Date.now();
    await expect(turn()).resolves.toBe('');
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ key: 'cloud-turn-failed' }));
  });

  it('keeps what he had already said', async () => {
    runs = [[started, ...said('Here is the first part.'), failed]];
    await expect(turn()).resolves.toBe('Here is the first part.');
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('says nothing about a turn that went well', async () => {
    runs = [
      [
        started,
        ...said('All done.'),
        { type: 'TEXT_MESSAGE_END', messageId: 'm1', timestamp: at },
        { type: 'RUN_FINISHED', runId: 'r1', threadId: 't', finishReason: 'stop', timestamp: at },
      ],
    ];
    await expect(turn()).resolves.toBe('All done.');
    expect(showToast).not.toHaveBeenCalled();
  });
});

describe('a turn whose connection drops', () => {
  const finished = [
    { type: 'TEXT_MESSAGE_END', messageId: 'm1', timestamp: at },
    { type: 'RUN_FINISHED', runId: 'r1', threadId: 't', finishReason: 'stop', timestamp: at },
  ];

  it('sends the request again and carries on', async () => {
    runs = [[started, ...said('Half a'), DROP], [started, ...said('All done.'), ...finished]];
    await expect(turn()).resolves.toBe('All done.');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('treats a stream that closed before the run finished as dropped, not done', async () => {
    runs = [[started, ...said('Half a')], [started, ...said('All done.'), ...finished]];
    await expect(turn()).resolves.toBe('All done.');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('gives up after three tries and says the connection is the problem', async () => {
    runs = [[started, DROP], [started, DROP], [started, DROP], [started, DROP]];
    await expect(turn()).resolves.toBe('');
    expect(runs).toHaveLength(0);
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'cloud-turn-failed', message: expect.stringContaining('could not be reached') }),
    );
  });

  it('does not send a refusal again', async () => {
    runs = [[started, failed], [started, ...said('Should not be asked for.'), ...finished]];
    await expect(turn()).resolves.toBe('');
    expect(runs).toHaveLength(1);
  });
});

describe('how a failed turn is said', () => {
  const lastToast = () => vi.mocked(showToast).mock.calls.at(-1)?.[0];

  it('gives a refusal its own sentence', () => {
    sayCloudTurnFailed(new Error('XHR error! status: 402 Payment Required'));
    expect(lastToast()).toEqual({ key: 'cloud-turn-failed', message: expect.stringContaining('AI Credits') });
  });

  it('says the connection is the problem when the server could not be reached', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    errors.mockClear();
    sayCloudTurnFailed(new Error('XHR request failed'));
    expect(lastToast()).toEqual({ key: 'cloud-turn-failed', message: expect.stringContaining('could not be reached') });
    sayCloudTurnFailed(new CloudUnreachable('Cannot reach Samwell Cloud at https://x (fetch failed: UnknownHostException)'));
    expect(lastToast()).toEqual({ key: 'cloud-turn-failed', message: expect.stringContaining('could not be reached') });
    // Offline is not a fault: nothing is raised as an error.
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('keeps the transport out of anything else', () => {
    sayCloudTurnFailed(new Error('XHR error! status: 503 upstream connect error or disconnect/reset'));
    expect(lastToast()).toEqual({ key: 'cloud-turn-failed', message: 'Samwell could not answer just now. Try again.' });
  });
});

describe('a tool call still being waited on', () => {
  const call = (part: Record<string, unknown>) =>
    ({ id: 'a1', role: 'assistant', parts: [{ type: 'tool-call', id: 't1', name: 'add_to_queue', arguments: '{}', ...part }] }) as never;

  it('waits on a call with no result yet, and on one awaiting the reader', () => {
    expect(hasPendingToolCall(call({ state: 'input-complete' }))).toBe(true);
    expect(hasPendingToolCall(call({ state: 'approval-requested', approval: { id: 'p1', needsApproval: true } }))).toBe(true);
    expect(hasPendingToolCall(call({ state: 'approval-responded', approval: { id: 'p1', needsApproval: true, approved: true } }))).toBe(true);
  });

  it('is done with a call that returned, failed, or was refused', () => {
    expect(hasPendingToolCall(call({ state: 'complete', output: { ok: true } }))).toBe(false);
    expect(hasPendingToolCall(call({ state: 'error' }))).toBe(false);
    // Said no to: nothing will ever come back, and the turn must still end.
    expect(hasPendingToolCall(call({ state: 'approval-responded', approval: { id: 'p1', needsApproval: true, approved: false } }))).toBe(false);
  });
});

describe('the status row after a tool, while he thinks again', () => {
  const finished = [
    { type: 'TEXT_MESSAGE_END', messageId: 'm1', timestamp: at },
    { type: 'RUN_FINISHED', runId: 'r1', threadId: 't', finishReason: 'stop', timestamp: at },
  ];
  // A server tool, so the whole turn is one scripted run.
  const searched = [
    { type: 'TOOL_CALL_START', toolCallId: 'w1', toolName: 'web_search', toolCallName: 'web_search', parentMessageId: 'm1', timestamp: at },
    { type: 'TOOL_CALL_ARGS', toolCallId: 'w1', delta: '{"query":"Chip Wilson"}', timestamp: at },
    { type: 'TOOL_CALL_END', toolCallId: 'w1', timestamp: at },
    { type: 'TOOL_CALL_RESULT', toolCallId: 'w1', messageId: 'tr1', content: '{"query":"Chip Wilson","sources":[]}', timestamp: at },
  ];
  const thinks = [
    { type: 'REASONING_START', messageId: 'r1', timestamp: at },
    { type: 'REASONING_MESSAGE_START', messageId: 'r1', role: 'reasoning', timestamp: at },
    { type: 'REASONING_MESSAGE_CONTENT', messageId: 'r1', delta: 'Weighing what came back.', timestamp: at },
  ];
  const answers = [{ type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: ' Here it is.', timestamp: at }];

  async function timeline(run: unknown[]) {
    runs = [run];
    const events: string[] = [];
    await sendCloudChatTurn({
      baseUrl: 'https://cloud.test',
      modelId: 'test-model',
      sessionId: 's1',
      bookId: null,
      mode: 'onboarding',
      history: [],
      content: 'Hello',
      onStreamingContent: () => {},
      onThinkingContent: () => events.push('think'),
      onToolStatus: (status) => events.push(status === null ? 'clear' : 'status'),
    });
    return events;
  }

  it('holds the row when words were already on screen, until new ones arrive', async () => {
    const events = await timeline([started, ...said('Let me look.'), ...searched, ...thinks, ...answers, ...finished]);
    expect(events).toContain('think');
    expect(events.indexOf('clear')).toBeGreaterThan(events.indexOf('think'));
  });

  it('hands the footer to the reasoning panel when nothing was said yet', async () => {
    const events = await timeline([
      started,
      { type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant', timestamp: at },
      ...searched,
      ...thinks,
      ...answers,
      ...finished,
    ]);
    expect(events.indexOf('clear')).toBeGreaterThanOrEqual(0);
    expect(events.indexOf('clear')).toBeLessThan(events.indexOf('think'));
  });

  it('starts each round of thinking on a new paragraph', async () => {
    runs = [
      [
        started,
        { type: 'REASONING_MESSAGE_START', messageId: 'r0', role: 'reasoning', timestamp: at },
        { type: 'REASONING_MESSAGE_CONTENT', messageId: 'r0', delta: 'My persona is gentle, insightful', timestamp: at },
        { type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant', timestamp: at },
        ...searched,
        ...thinks,
        ...answers,
        ...finished,
      ],
    ];
    let trace = '';
    await sendCloudChatTurn({
      baseUrl: 'https://cloud.test',
      modelId: 'test-model',
      sessionId: 's1',
      bookId: null,
      mode: 'onboarding',
      history: [],
      content: 'Hello',
      onStreamingContent: () => {},
      onThinkingContent: (content) => {
        trace = content;
      },
      onToolStatus: () => {},
    });
    expect(trace).toBe('My persona is gentle, insightful\n\nWeighing what came back.');
  });
});
