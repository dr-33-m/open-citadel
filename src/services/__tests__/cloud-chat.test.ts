import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * A turn the server fails after it has opened the stream. It can no longer
 * answer with an error status, so it sends `RUN_ERROR` inside a 200. The app
 * used to miss that and wait out the two-minute inactivity window with the orb
 * running, then end the turn with nothing said.
 */

const at = Date.now();
let runs: unknown[][] = [];

vi.mock('@tanstack/ai-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/ai-client')>();
  return {
    ...actual,
    // The real client, fed a scripted stream instead of the network.
    xhrHttpStream: () =>
      actual.stream(async function* () {
        for (const chunk of runs.shift() ?? []) yield chunk as never;
      }),
  };
});
vi.mock('@/components/toast/toast-provider', () => ({ showToast: vi.fn() }));
vi.mock('@/services/cloud-identity', () => ({ cloudHeaders: async () => ({}) }));
vi.mock('@/services/chat-tools', () => ({}));
vi.mock('@/services/compass-tools', () => ({}));
vi.mock('@/services/journey', () => ({}));
vi.mock('@/services/onboarding-tools/client-tools', () => ({ createOnboardingClientTools: () => undefined }));
vi.mock('@/stores/approval', () => ({
  useApprovalStore: { getState: () => ({ clearSession: () => {}, requestApproval: async () => false }) },
}));
vi.mock('@/stores/settings', () => ({ useSettingsStore: { getState: () => ({ cloudThinkingBudget: 'low' }) } }));

const { showToast } = await import('@/components/toast/toast-provider');
const { sayCloudTurnFailed, sendCloudChatTurn } = await import('@/services/cloud-chat');

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

describe('how a failed turn is said', () => {
  const lastToast = () => vi.mocked(showToast).mock.calls.at(-1)?.[0];

  it('gives a refusal its own sentence', () => {
    sayCloudTurnFailed(new Error('XHR error! status: 402 Payment Required'));
    expect(lastToast()).toEqual({ key: 'cloud-turn-failed', message: expect.stringContaining('AI Credits') });
  });

  it('keeps the transport out of anything else', () => {
    sayCloudTurnFailed(new Error('XHR error! status: 503 upstream connect error or disconnect/reset'));
    expect(lastToast()).toEqual({ key: 'cloud-turn-failed', message: 'Samwell could not answer just now. Try again.' });
  });
});
