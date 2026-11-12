import { describe, expect, it } from 'vitest';

import { PANE_TITLES, SETTINGS_PANES, isSettingsPane, paneScrolls } from '@/features/settings/utils/panes';

describe('isSettingsPane', () => {
  it('accepts a pane and nothing else', () => {
    expect(isSettingsPane('voice')).toBe(true);
    expect(isSettingsPane('cloud')).toBe(false);
    expect(isSettingsPane(undefined)).toBe(false);
  });
});

describe('PANE_TITLES', () => {
  it('names every pane', () => {
    for (const pane of SETTINGS_PANES) expect(PANE_TITLES[pane]).toBeTruthy();
  });
});

describe('paneScrolls', () => {
  it('leaves a list to scroll itself', () => {
    expect(paneScrolls('memory')).toBe(false);
    expect(paneScrolls('voice')).toBe(true);
  });
});
