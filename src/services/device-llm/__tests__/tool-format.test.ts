import { describe, expect, it } from 'vitest';

import { GEMMA_TOOL_FORMAT, parseGemmaArguments } from '../tool-format';

const Q = '<|"|>';

describe('parseGemmaArguments', () => {
  it('reads bare keys and quoted strings', () => {
    expect(parseGemmaArguments(`query:${Q}grief${Q},tag:${Q}loss${Q}`)).toEqual({ query: 'grief', tag: 'loss' });
  });

  it('keeps a colon inside a string as part of the string', () => {
    // A global `word:` → `"word":` rewrite turned this into broken JSON and the
    // call was dropped.
    expect(parseGemmaArguments(`query:${Q}note: grief, then hope${Q}`)).toEqual({
      query: 'note: grief, then hope',
    });
  });

  it('reads numbers, booleans, nested objects and arrays', () => {
    expect(
      parseGemmaArguments(`limit:5,exact:true,filters:{tags:[${Q}a${Q},${Q}b${Q}],since:null}`),
    ).toEqual({ limit: 5, exact: true, filters: { tags: ['a', 'b'], since: null } });
  });

  it('reads an empty body as no arguments', () => {
    expect(parseGemmaArguments('')).toEqual({});
  });

  it('gives up on a string that never closes', () => {
    expect(parseGemmaArguments(`query:${Q}grief`)).toBeNull();
  });
});

describe('GEMMA_TOOL_FORMAT.parse', () => {
  it('reads a call and the prose around it', () => {
    const out = GEMMA_TOOL_FORMAT.parse(
      `Let me look.<|tool_call>call:search_highlights{query:${Q}courage${Q}}<tool_call|>`,
    );
    expect(out?.toolCalls).toEqual([
      { type: 'function', function: { name: 'search_highlights', arguments: { query: 'courage' } } },
    ]);
    expect(out?.textContent).toBe('Let me look.');
  });

  it('reads several calls in one reply', () => {
    const out = GEMMA_TOOL_FORMAT.parse(
      `<|tool_call>call:list_collections{}<tool_call|><|tool_call>call:search_thoughts{query:${Q}x${Q}}<tool_call|>`,
    );
    expect(out?.toolCalls.map((c) => c.function.name)).toEqual(['list_collections', 'search_thoughts']);
  });

  it('reads a call whose arguments hold braces of their own', () => {
    const out = GEMMA_TOOL_FORMAT.parse(`<|tool_call>call:f{a:{b:1}}<tool_call|>`);
    expect(out?.toolCalls[0].function.arguments).toEqual({ a: { b: 1 } });
  });

  it('drops a call it cannot read rather than running it with no arguments', () => {
    // An empty argument list for a delete or a tag does something nobody asked.
    expect(GEMMA_TOOL_FORMAT.parse(`<|tool_call>call:delete_thought{id:${Q}t-1}<tool_call|>`)).toBeUndefined();
  });

  it('returns nothing for plain prose', () => {
    expect(GEMMA_TOOL_FORMAT.parse('Courage is a habit.')).toBeUndefined();
  });

  it('stops generation once a call closes', () => {
    expect(GEMMA_TOOL_FORMAT.stopRegex.test('<|tool_call>call:f{}<tool_call|>')).toBe(true);
    expect(GEMMA_TOOL_FORMAT.stopRegex.test('<|tool_call>call:f{')).toBe(false);
  });
});

describe('GEMMA_TOOL_FORMAT.visible', () => {
  it('shows prose and hides a call from its first marker on', () => {
    expect(GEMMA_TOOL_FORMAT.visible(`Let me look.<|tool_call>call:f{q:${Q}x`)).toBe('Let me look.');
  });

  it('holds back a marker still arriving', () => {
    expect(GEMMA_TOOL_FORMAT.visible('Let me look.<|tool_c')).toBe('Let me look.');
    expect(GEMMA_TOOL_FORMAT.visible('Let me look.<')).toBe('Let me look.');
  });

  it('leaves text alone when there is no call', () => {
    expect(GEMMA_TOOL_FORMAT.visible('Courage is a habit.')).toBe('Courage is a habit.');
  });
});
