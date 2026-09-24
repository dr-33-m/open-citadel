import { describe, expect, it } from 'vitest';

import { turnIndicator } from '../agent-activity';

describe('turnIndicator', () => {
  it('shows chat titling after the reply lands, ahead of a completed trace', () => {
    expect(
      turnIndicator({
        isGenerating: true,
        isTitling: true,
        isToolCalling: false,
        toolCallName: null,
        toolCallStatus: null,
        isThinking: false,
        isStreaming: false,
        trace: 'The completed reasoning trace',
      }),
    ).toEqual({
      kind: 'activity',
      activity: { orb: 'shaping', label: 'Naming this chat…' },
    });
  });

  it('keeps the streamed reply as the status during ordinary generation', () => {
    expect(
      turnIndicator({
        isGenerating: true,
        isToolCalling: false,
        toolCallName: null,
        toolCallStatus: null,
        isThinking: false,
        isStreaming: true,
        trace: '',
      }),
    ).toBeNull();
  });

  it('shows no orb while a message waits behind a chat being named, then the usual one', () => {
    const waiting = {
      isGenerating: true,
      isToolCalling: false,
      toolCallName: null,
      toolCallStatus: null,
      isThinking: false,
      isStreaming: false,
      trace: '',
    };
    expect(turnIndicator({ ...waiting, isQueued: true })).toBeNull();
    expect(turnIndicator({ ...waiting, isQueued: false })).toEqual({
      kind: 'activity',
      activity: { orb: 'working', label: 'Processing…' },
    });
  });
});
