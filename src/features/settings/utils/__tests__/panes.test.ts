import { describe, expect, it } from 'vitest';

import { isSettingsPane, stepBack, warmPanes } from '@/features/settings/utils/panes';

describe('stepBack', () => {
  it('leaves Settings from the list', () => {
    expect(stepBack([], null)).toBeNull();
  });

  it('returns to the list from a pane opened from it', () => {
    expect(stepBack(['voice'], null)).toEqual([]);
  });

  it('goes one pane up, not all the way out', () => {
    expect(stepBack(['samwell', 'profile'], null)).toEqual(['samwell']);
  });

  it('leaves Settings from the pane it was opened straight onto', () => {
    expect(stepBack(['samwell'], 'samwell')).toBeNull();
  });

  it('still steps back to that pane from one opened over it', () => {
    expect(stepBack(['samwell', 'profile'], 'samwell')).toEqual(['samwell']);
  });
});

describe('warmPanes', () => {
  it('builds none, then the first few, then all', () => {
    expect(Object.values(warmPanes(0)).some(Boolean)).toBe(false);
    expect(warmPanes(1)).toEqual({ samwell: true, voice: false, podcasts: false, profile: false, memory: false });
    expect(Object.values(warmPanes(5)).every(Boolean)).toBe(true);
  });
});

describe('isSettingsPane', () => {
  it('accepts a pane and nothing else', () => {
    expect(isSettingsPane('voice')).toBe(true);
    expect(isSettingsPane('cloud')).toBe(false);
    expect(isSettingsPane(undefined)).toBe(false);
  });
});
