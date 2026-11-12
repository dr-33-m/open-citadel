import { describe, expect, it, vi } from 'vitest';

import { threadCheckpoints, clearCheckpoints } from '../compaction-checkpoints.js';
import {
  COMPACTION_SUMMARY_PROMPT,
  COMPACTION_UPDATE_PROMPT,
  serializeForSummary,
  summaryRequest,
} from '../compaction-summary.js';

// Hoisted above the imports by vitest: the summary module bills and calls a model.
vi.mock('../db.js', () => ({ recordUsageEvent: vi.fn() }));
vi.mock('../structured-analysis.js', () => ({ runStructuredAnalysis: vi.fn() }));

describe('serializeForSummary', () => {
  it('labels who spoke, names tool calls and clips long results', () => {
    const text = serializeForSummary([
      { role: 'user', content: 'What should I read on habits?' },
      {
        role: 'assistant',
        content: 'Let me look.',
        toolCalls: [{ id: 'c1', type: 'function', function: { name: 'web_search', arguments: '{"query":"habits"}' } }],
      },
      { role: 'tool', content: 'r'.repeat(2_500), toolCallId: 'c1' },
      { role: 'assistant', content: 'Atomic Habits [[book:book-1]]' },
    ] as never);

    expect(text).toContain('[They]: What should I read on habits?');
    expect(text).toContain('[Samwell looked up]: web_search({"query":"habits"})');
    expect(text).toContain('[500 more characters]');
    expect(text).toContain('[Samwell]: Atomic Habits [[book:book-1]]');
  });
});

describe('summaryRequest', () => {
  it('writes a fresh note when there is none', () => {
    const request = summaryRequest([{ role: 'user', content: 'hi' }] as never, null);
    expect(request.systemPrompt).toBe(COMPACTION_SUMMARY_PROMPT);
    expect(request.content).toContain('<conversation>');
    expect(request.content).not.toContain('<previous-note>');
  });

  it('hands over the earlier note to be updated', () => {
    const request = summaryRequest([{ role: 'user', content: 'hi' }] as never, 'Earlier note.');
    expect(request.systemPrompt).toBe(COMPACTION_UPDATE_PROMPT);
    expect(request.content).toContain('<previous-note>\nEarlier note.\n</previous-note>');
  });

  it('asks for what is still open and never for an invented reference', () => {
    expect(COMPACTION_SUMMARY_PROMPT).toContain('## Still open');
    expect(COMPACTION_SUMMARY_PROMPT).toContain('never write one that is not there');
    expect(COMPACTION_SUMMARY_PROMPT).not.toMatch(/—/);
  });
});

describe('threadCheckpoints', () => {
  const checkpoint = { covered: 4, fingerprint: 'f', summary: 's' };

  it('keeps one summary per account and thread', () => {
    clearCheckpoints();
    threadCheckpoints('a', 't1')!.set(checkpoint);
    expect(threadCheckpoints('a', 't1')!.get()?.summary).toBe('s');
    expect(threadCheckpoints('a', 't2')!.get()).toBeUndefined();
    expect(threadCheckpoints('b', 't1')!.get()).toBeUndefined();
  });

  it('has nowhere to keep one without a thread', () => {
    expect(threadCheckpoints('a', undefined)).toBeUndefined();
  });

  it('forgets a summary after a long quiet', () => {
    clearCheckpoints();
    let now = 0;
    const store = threadCheckpoints('a', 't1', () => now)!;
    store.set(checkpoint);
    now = 13 * 60 * 60_000;
    expect(store.get()).toBeUndefined();
  });
});
