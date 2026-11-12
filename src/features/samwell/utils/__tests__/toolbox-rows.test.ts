import { describe, expect, it } from 'vitest';

import { toolboxRows } from '../toolbox-rows';

const tool = (id: string, lead = false) => ({ id, lead });
const ids = (rows: { id: string }[][]) => rows.map((row) => row.map((item) => item.id));

describe('toolboxRows', () => {
  const shared = [tool('brain'), tool('history')];

  it('puts three of the tab first and the conversation tools under them', () => {
    const reading = [tool('book', true), tool('post'), tool('episode')];
    expect(ids(toolboxRows(reading, shared))).toEqual([['book', 'post', 'episode'], ['brain', 'history']]);
  });

  it('leads with the lead wherever the caller listed it', () => {
    const compass = [tool('planner'), tool('deck', true), tool('insights')];
    expect(ids(toolboxRows(compass, shared))[0]).toEqual(['deck', 'planner', 'insights']);
  });

  it('starts the second row with a tab that has more than a row of its own', () => {
    const compass = [tool('deck', true), tool('planner'), tool('insights'), tool('past-goals')];
    expect(ids(toolboxRows(compass, shared))).toEqual([
      ['deck', 'planner', 'insights'],
      ['past-goals', 'brain', 'history'],
    ]);
  });

  it('keeps a short tab to its own row rather than pulling the shared tools up', () => {
    expect(ids(toolboxRows([tool('book', true)], shared))).toEqual([['book'], ['brain', 'history']]);
  });

  it('draws no empty row', () => {
    expect(ids(toolboxRows([], [tool('history')]))).toEqual([['history']]);
    expect(toolboxRows([], [])).toEqual([]);
  });
});
