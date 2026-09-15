import { describe, expect, it, vi } from 'vitest';
import {
  SAMWELL_SYSTEM_PROMPT,
  SAMWELL_SYSTEM_PROMPT_COMPACT,
  SAMWELL_SYSTEM_PROMPT_NO_TOOLS,
} from 'samwell-shared';

import { promptAndToolsFor, SAMWELL_TOOLS_LITERT, SAMWELL_TOOLS_LITERT_DEVICE } from '../chat-tools';
import { estimateTokens } from '../context-budget';

// chat-tools reaches the database and the stores at import time; none of that
// is under test here, only the choice of prompt and tools.
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/db/schema', () => ({}));
vi.mock('@/stores/books', () => ({ useBooksStore: { getState: () => ({}) } }));
vi.mock('@/stores/collections', () => ({ useCollectionsStore: { getState: () => ({}) } }));
vi.mock('@/stores/reader', () => ({ useReaderStore: { getState: () => ({}) } }));
vi.mock('@/stores/timeline', () => ({ useTimelineStore: { getState: () => ({}) } }));
vi.mock('@/services/book-context', () => ({ extractReadSections: () => [] }));
vi.mock('@/services/journey', () => ({ formatJourneyNotes: () => '', searchJourneyNotes: () => [] }));

/** Mirrors the baseline `inference.ts` charges against the window. */
function baseline(maxContextTokens: number, enableToolCalling: boolean): number {
  const { systemPrompt, tools } = promptAndToolsFor(maxContextTokens, enableToolCalling);
  return (
    estimateTokens(systemPrompt) +
    tools.reduce((n, t) => n + estimateTokens(`${t.name}${t.description}${t.parametersJson}`), 0)
  );
}

const REPLY_RESERVE_TOKENS = 768;

describe('promptAndToolsFor', () => {
  it('loads no tools in a window too small to hold them', () => {
    const r = promptAndToolsFor(2048, true);
    expect(r.tools).toEqual([]);
    expect(r.systemPrompt).toBe(SAMWELL_SYSTEM_PROMPT_NO_TOOLS);
  });

  it('loads the device toolset with its matching prompt at 4K', () => {
    const r = promptAndToolsFor(4096, true);
    expect(r.tools).toBe(SAMWELL_TOOLS_LITERT_DEVICE);
    expect(r.systemPrompt).toBe(SAMWELL_SYSTEM_PROMPT_COMPACT);
  });

  it('loads the full catalogue from 8K', () => {
    const r = promptAndToolsFor(8192, true);
    expect(r.tools).toBe(SAMWELL_TOOLS_LITERT);
    expect(r.systemPrompt).toBe(SAMWELL_SYSTEM_PROMPT);
  });

  it('never describes tools when tool calling is off, whatever the window', () => {
    for (const size of [2048, 4096, 8192]) {
      const r = promptAndToolsFor(size, false);
      expect(r.tools).toEqual([]);
      expect(r.systemPrompt).toBe(SAMWELL_SYSTEM_PROMPT_NO_TOOLS);
    }
  });

  it('leaves room for a first message at every size the settings offer', () => {
    // The regression this guards: at 2K the prompt and schemas together were
    // larger than the usable window, so every first message read as full.
    const firstMessage = estimateTokens('Hi Samwell how are you?');
    for (const size of [2048, 4096]) {
      for (const tools of [true, false]) {
        expect(baseline(size, tools) + firstMessage).toBeLessThanOrEqual(size - REPLY_RESERVE_TOKENS);
      }
    }
  });
});
