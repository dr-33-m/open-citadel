import { describe, expect, it } from 'vitest';

import { turnIndicator } from '../agent-activity';

const base = {
  isGenerating: true,
  isTitling: false,
  isToolCalling: false,
  toolCallName: null,
  toolCallStatus: null,
  isThinking: false,
  isStreaming: false,
  trace: '',
};

describe('turnIndicator, reasoning before its text', () => {
  it('shows the reasoning panel as soon as thinking starts, with no trace yet', () => {
    // Waiting for trace text drew a plain "Thinking…" row first and swapped it
    // for the panel when the text arrived, which read as rendering twice.
    const r = turnIndicator({ ...base, isThinking: true });
    expect(r?.kind).toBe('trace');
  });

  it('gives the row up once the answer streams: the reply is the status, and its footer keeps the thought', () => {
    expect(turnIndicator({ ...base, isStreaming: true, traceSeconds: 4 })).toBeNull();
    expect(turnIndicator({ ...base, isStreaming: true, trace: 'Weighing it up.' })).toBeNull();
  });

  it('brings the row back for a tool called after the answer started', () => {
    const r = turnIndicator({ ...base, isStreaming: true, isToolCalling: true, toolCallName: 'web_search', toolCallStatus: 'running', trace: 'Weighing it up.' });
    expect(r?.kind).toBe('trace');
  });

  it('still shows the plain wait for a model that is not reasoning', () => {
    const r = turnIndicator({ ...base });
    expect(r?.kind).toBe('activity');
  });

  it('shows nothing for a finished turn that left no trace', () => {
    expect(turnIndicator({ ...base, isGenerating: false, traceSeconds: 4 })).toBeNull();
  });
});
