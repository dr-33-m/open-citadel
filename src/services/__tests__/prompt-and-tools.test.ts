import { describe, expect, it, vi } from 'vitest';
import {
  SAMWELL_SYSTEM_PROMPT_COMPACT,
  SAMWELL_SYSTEM_PROMPT_NO_TOOLS,
} from 'samwell-shared';

import { baselineTokens, promptAndToolsFor, SAMWELL_DEVICE_TOOLS } from '../chat-tools';
import { estimateTokens, usableTokens } from '../context-budget';

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

/** The windows the catalogue's exports come in: most at 2048, Gemma 4 E2B at 4048. */
const WINDOWS = [2048, 4048];

describe('promptAndToolsFor', () => {
  it('loads no tools in a 2K window, too small to hold them', () => {
    const r = promptAndToolsFor(2048, true);
    expect(r.tools).toEqual([]);
    expect(r.systemPrompt).toBe(SAMWELL_SYSTEM_PROMPT_NO_TOOLS);
  });

  it("loads the device toolset with its matching prompt in Gemma 4 E2B's window", () => {
    // 4048, not 4096: gating tools on a round 4096 would have left the one
    // tool-calling brain in the catalogue without them.
    const r = promptAndToolsFor(4048, true);
    expect(r.tools).toBe(SAMWELL_DEVICE_TOOLS);
    expect(r.systemPrompt).toBe(SAMWELL_SYSTEM_PROMPT_COMPACT);
  });

  it('loads the full catalogue once a window can afford it', () => {
    const r = promptAndToolsFor(16384, true);
    expect(r.tools.length).toBeGreaterThan(SAMWELL_DEVICE_TOOLS.length);
  });

  it('never describes tools when tool calling is off, whatever the window', () => {
    for (const size of [...WINDOWS, 16384]) {
      const r = promptAndToolsFor(size, false);
      expect(r.tools).toEqual([]);
      expect(r.systemPrompt).toBe(SAMWELL_SYSTEM_PROMPT_NO_TOOLS);
    }
  });

  it('leaves room for a first message in every window the catalogue has', () => {
    // The regression this guards: at 2K the prompt and schemas together were
    // larger than the usable window, so every first message read as full.
    const firstMessage = estimateTokens('Hi Samwell how are you?');
    for (const size of WINDOWS) {
      for (const tools of [true, false]) {
        const r = promptAndToolsFor(size, tools);
        expect(baselineTokens(r.systemPrompt, r.tools) + firstMessage).toBeLessThanOrEqual(
          usableTokens(size),
        );
      }
    }
  });
});
