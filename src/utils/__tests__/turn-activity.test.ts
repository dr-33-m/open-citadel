import { describe, expect, it } from 'vitest';

import { parseActivity, sameActivity, serializeActivity, settleActivity, turnActivity, withThought, type ActivityMessage } from '../turn-activity';

const call = (id: string, name: string, args: unknown, extra: Record<string, unknown> = {}) => ({
  type: 'tool-call',
  id,
  name,
  arguments: JSON.stringify(args),
  state: 'input-complete',
  ...extra,
});

const conversation = (...assistantParts: ActivityMessage['parts'][number][][]): ActivityMessage[] => [
  { role: 'user', parts: [{ type: 'text' }] },
  { role: 'assistant', parts: [call('old', 'search_library', { query: 'earlier turn' }, { output: { total: 1 } })] },
  { role: 'user', parts: [{ type: 'text' }] },
  ...assistantParts.map((parts) => ({ role: 'assistant', parts })),
];

describe('turnActivity', () => {
  it('reads only the turn in progress, in order', () => {
    const activity = turnActivity(
      conversation(
        [call('a', 'search_library', { query: 'Taste of Luxury' }, { output: { total: 1, books: [] } })],
        [call('b', 'web_search', { query: 'Nadege Forestier' })],
      ),
    );
    expect(activity.steps).toEqual([
      { id: 'a', tool: 'search_library', title: 'Looked for "Taste of Luxury" in your library', detail: 'Found 1 book', status: 'done' },
      { id: 'b', tool: 'web_search', title: 'Searching the web for "Nadege Forestier"', detail: null, status: 'running' },
    ]);
  });

  it('gathers the pages a search found, each once', () => {
    const page = (url: string) => ({ title: url, url, snippet: 'x' });
    const activity = turnActivity(
      conversation([
        call('a', 'web_search', { query: 'one' }, { output: { query: 'one', sources: [page('https://a.com'), page('https://b.com')] } }),
        call('b', 'web_search', { query: 'two' }, { output: { query: 'two', sources: [page('https://b.com'), page('https://c.com')] } }),
      ]),
    );
    expect(activity.sources.map((s) => s.url)).toEqual(['https://a.com', 'https://b.com', 'https://c.com']);
    expect(activity.steps[0]?.detail).toBe('Found 2 pages');
  });

  it('says when a step was declined or failed', () => {
    const activity = turnActivity(
      conversation([
        call('a', 'add_to_queue', {}, { approval: { approved: false }, output: { ok: false } }),
        call('b', 'delete_book', {}, { output: { ok: false, error: 'book_not_found', succeeded: [], failed: [] } }),
        call('c', 'mark_as_finished', {}, { output: { ok: true, succeeded: ['Dressed'], failed: [] } }),
      ]),
    );
    expect(activity.steps.map((s) => [s.status, s.detail])).toEqual([
      ['declined', 'You said no'],
      ['failed', 'Could not be done'],
      ['done', 'Dressed'],
    ]);
  });

  it('tolerates arguments that are still streaming', () => {
    const activity = turnActivity(conversation([{ type: 'tool-call', id: 'a', name: 'web_search', arguments: '{"que' }]));
    expect(activity.steps[0]?.title).toBe('Searching the web for');
  });
});

describe('serialize and parse', () => {
  it('round-trips, ending a step left running', () => {
    const activity = turnActivity(conversation([call('a', 'web_search', { query: 'q' })]));
    const back = parseActivity(serializeActivity(activity));
    expect(back?.steps[0]).toMatchObject({ status: 'failed', detail: 'Stopped' });
  });

  it('keeps nothing for a turn that did nothing, and survives junk', () => {
    expect(serializeActivity({ steps: [], sources: [] })).toBeNull();
    expect(parseActivity('not json')).toBeNull();
    expect(parseActivity(null)).toBeNull();
  });
});

describe('sameActivity', () => {
  it('notices a status change and ignores a rebuild of the same thing', () => {
    const running = turnActivity(conversation([call('a', 'web_search', { query: 'q' })]));
    const again = turnActivity(conversation([call('a', 'web_search', { query: 'q' })]));
    const done = turnActivity(conversation([call('a', 'web_search', { query: 'q' }, { output: { sources: [] } })]));
    expect(sameActivity(running, again)).toBe(true);
    expect(sameActivity(running, done)).toBe(false);
  });
});

describe('settleActivity', () => {
  it('ends a step still running when the turn did, so nothing shimmers under a finished reply', () => {
    const settled = settleActivity(turnActivity(conversation([call('a', 'web_search', { query: 'q' })])));
    expect(settled?.steps).toEqual([expect.objectContaining({ status: 'failed', detail: 'Stopped' })]);
  });

  it('hands back a finished activity as it was, and nothing for an empty one', () => {
    const done = turnActivity(conversation([call('a', 'web_search', { query: 'q' }, { output: { sources: [] } })]));
    expect(settleActivity(done)).toBe(done);
    expect(settleActivity({ steps: [], sources: [] })).toBeNull();
    expect(settleActivity(null)).toBeNull();
  });
});

describe('withThought', () => {
  it('keeps what he thought with the reply, through the database and back', () => {
    const kept = withThought(null, '  Weighing the two editions.  ', 12);
    expect(kept).toEqual({ steps: [], sources: [], thought: { text: 'Weighing the two editions.', seconds: 12 } });
    expect(parseActivity(serializeActivity(kept))).toEqual(kept);
  });

  it('leaves out a trace with no words in it', () => {
    expect(withThought(null, '   ', 4)).toBeNull();
  });

  it('keeps an unmeasured thought, without a duration', () => {
    expect(withThought(null, 'Hmm.', undefined)?.thought).toEqual({ text: 'Hmm.', seconds: null });
  });
});
