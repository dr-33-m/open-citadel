import { describe, expect, it } from 'vitest';

import {
  READING_LIMITS,
  SEARCH_LIMITS,
  TOOL_RESULT_TOKEN_BUDGET,
  type ToolRuntime,
} from '../tool-limits';

const RUNTIMES: ToolRuntime[] = ['device', 'cloud'];

describe('tool result budget', () => {
  it('keeps the device budget inside a 4096-token window', () => {
    // The window also has to hold the system prompt, tool schemas and the
    // conversation, so one result may not take a large share of it.
    expect(TOOL_RESULT_TOKEN_BUDGET.device).toBeLessThan(1000);
  });

  it('gives cloud room a device could never have', () => {
    expect(TOOL_RESULT_TOKEN_BUDGET.cloud).toBeGreaterThan(
      TOOL_RESULT_TOKEN_BUDGET.device * 10,
    );
  });

  it('still bounds cloud, so a runaway search cannot balloon a request', () => {
    // Cloud windows are ~200k. A single tool result taking even a tenth of
    // that would be filling the window because it is there, not because the
    // material is relevant.
    expect(TOOL_RESULT_TOKEN_BUDGET.cloud).toBeLessThan(20_000);
  });
});

describe('search limits', () => {
  it('lets cloud see more of everything than device', () => {
    for (const key of ['matched', 'recent', 'notes', 'library'] as const) {
      expect(SEARCH_LIMITS.cloud[key]).toBeGreaterThanOrEqual(SEARCH_LIMITS.device[key]);
    }
  });

  it('never returns more unfiltered rows than matched ones', () => {
    // The balance rule: rows that matched nothing carry no relevance signal,
    // so widening them is how a context window gets polluted.
    for (const runtime of RUNTIMES) {
      expect(SEARCH_LIMITS[runtime].recent).toBeLessThanOrEqual(
        SEARCH_LIMITS[runtime].matched,
      );
    }
  });

  it('keeps cloud’s unfiltered ceiling modest despite the room', () => {
    expect(SEARCH_LIMITS.cloud.recent).toBeLessThan(SEARCH_LIMITS.cloud.matched / 2);
  });

  it('asks for at least one row everywhere', () => {
    for (const runtime of RUNTIMES) {
      for (const value of Object.values(SEARCH_LIMITS[runtime])) {
        expect(value).toBeGreaterThan(0);
      }
    }
  });
});

describe('reading limits', () => {
  it('lets cloud read wider and deeper than device', () => {
    for (const key of ['maxSnippets', 'maxPerBook', 'window', 'finishedBooks', 'totalChars'] as const) {
      expect(READING_LIMITS.cloud[key]).toBeGreaterThan(READING_LIMITS.device[key]);
    }
  });

  it('keeps one book from taking the whole result set', () => {
    for (const runtime of RUNTIMES) {
      expect(READING_LIMITS[runtime].maxPerBook).toBeLessThan(
        READING_LIMITS[runtime].maxSnippets,
      );
    }
  });

  it('keeps device snippets small enough to fit its result budget', () => {
    const { maxSnippets, window } = READING_LIMITS.device;
    // Two windows of context per hit, at a conservative 3.2 chars per token.
    const worstCaseTokens = (maxSnippets * window * 2) / 3.2;
    expect(worstCaseTokens).toBeLessThan(TOOL_RESULT_TOKEN_BUDGET.device * 3);
  });
});
