import { describe, expect, it } from 'vitest';

import { CLIENT_TOOLS_ADDED_LATER, offeredClientTools, offersAny } from '../offered-tools.js';

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

describe('offersAny', () => {
  const listening = new Set(['list_my_podcasts', 'search_blog_posts']);

  it('is true when the app declared one of the tools', () => {
    expect(offersAny([{ name: 'search_highlights' }, { name: 'list_my_podcasts' }], listening)).toBe(true);
  });

  it('is false for an app that declared none of them, or declared nothing', () => {
    expect(offersAny([{ name: 'search_highlights' }], listening)).toBe(false);
    expect(offersAny(undefined, listening)).toBe(false);
  });

  it('keeps the podcast and blog tools from builds that declare nothing', () => {
    expect(CLIENT_TOOLS_ADDED_LATER.has('list_my_podcasts')).toBe(true);
    expect(CLIENT_TOOLS_ADDED_LATER.has('search_blog_posts')).toBe(true);
  });
});
