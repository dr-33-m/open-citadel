import { describe, expect, it } from 'vitest';

import { offeredClientTools } from '../offered-tools.js';

const defs = [{ name: 'search_highlights' }, { name: 'search_library' }, { name: 'add_to_queue' }];

describe('offeredClientTools', () => {
  it('offers only what the app declared it can run', () => {
    const declared = [{ name: 'search_highlights', parameters: {} }, { name: 'add_to_queue' }];
    expect(offeredClientTools(defs, declared).map((t) => t.name)).toEqual(['search_highlights', 'add_to_queue']);
  });

  it('never adds a tool the server does not define', () => {
    expect(offeredClientTools(defs, [{ name: 'rm_rf' }, { name: 'search_library' }]).map((t) => t.name)).toEqual([
      'search_library',
    ]);
  });

  it('gives a build that declares nothing every tool but the later ones', () => {
    expect(offeredClientTools(defs, undefined).map((t) => t.name)).toEqual(['search_highlights', 'add_to_queue']);
    expect(offeredClientTools(defs, []).map((t) => t.name)).toEqual(['search_highlights', 'add_to_queue']);
  });
});
