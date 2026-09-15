import { describe, expect, it } from 'vitest';

import {
  LEGACY_TOOL_CALL_PREFIX,
  TOOL_CALL_PREFIX,
  isToolCallMessage,
  isVisibleChatMessage,
  toolCallPayload,
} from '../chat-transcript';

const msg = (role: 'system' | 'user' | 'assistant' | 'tool', content: string) => ({ role, content });

describe('isToolCallMessage', () => {
  it('recognises the current marker', () => {
    expect(isToolCallMessage(`${TOOL_CALL_PREFIX}[{"name":"search_reading"}]`)).toBe(true);
  });

  it('still recognises the legacy NUL-wrapped marker', () => {
    expect(isToolCallMessage(`${LEGACY_TOOL_CALL_PREFIX}[]`)).toBe(true);
  });

  it('leaves ordinary prose alone', () => {
    expect(isToolCallMessage('Here are your latest highlights')).toBe(false);
  });

  it('uses a marker free of NUL bytes', () => {
    // A NUL in the marker is what stopped it surviving storage in the first place.
    expect(TOOL_CALL_PREFIX).not.toContain('\0');
  });
});

describe('toolCallPayload', () => {
  it('strips either marker', () => {
    expect(toolCallPayload(`${TOOL_CALL_PREFIX}[1]`)).toBe('[1]');
    expect(toolCallPayload(`${LEGACY_TOOL_CALL_PREFIX}[1]`)).toBe('[1]');
  });

  it('passes unmarked content through', () => {
    expect(toolCallPayload('plain')).toBe('plain');
  });
});

describe('isVisibleChatMessage', () => {
  it('shows ordinary user and assistant turns', () => {
    expect(isVisibleChatMessage(msg('user', 'hello'))).toBe(true);
    expect(isVisibleChatMessage(msg('assistant', 'hello back'))).toBe(true);
  });

  it('hides priming and raw tool output', () => {
    expect(isVisibleChatMessage(msg('system', 'book context'))).toBe(false);
    expect(isVisibleChatMessage(msg('tool', 'results'))).toBe(false);
  });

  it('hides tool-call rows under either marker', () => {
    expect(isVisibleChatMessage(msg('assistant', `${TOOL_CALL_PREFIX}[]`))).toBe(false);
    expect(isVisibleChatMessage(msg('assistant', `${LEGACY_TOOL_CALL_PREFIX}[]`))).toBe(false);
  });

  it('hides blank rows, which is how a marker lost in storage shows up', () => {
    expect(isVisibleChatMessage(msg('assistant', ''))).toBe(false);
    expect(isVisibleChatMessage(msg('assistant', '   '))).toBe(false);
  });
});
