import { describe, expect, it } from 'vitest';

import { linkEpisodeTimes, parseEpisodeTimes, timeFromLink } from '@/features/chat/utils/episode-times';

describe('parseEpisodeTimes', () => {
  it('finds minutes-and-seconds and hours-minutes-seconds', () => {
    expect(parseEpisodeTimes('He says so at [12:04], and again at [1:02:10].')).toEqual([
      { index: 14, length: 7, seconds: 724, label: '12:04' },
      { index: 36, length: 9, seconds: 3730, label: '1:02:10' },
    ]);
  });

  it('leaves look-alikes alone', () => {
    for (const text of ['[12:60]', '[1:2]', '[123:04]', '[12:04](https://x.com)', '[[12:04]]', 'at 12:04 sharp', '[a:bc]', '[12:04:99]']) {
      expect(parseEpisodeTimes(text), text).toEqual([]);
    }
  });
});

describe('linkEpisodeTimes', () => {
  it('writes each time as a link the reply catches', () => {
    expect(linkEpisodeTimes('See [0:45] and [1:00:00].')).toBe('See [0:45](oc-time:45) and [1:00:00](oc-time:3600).');
    expect(linkEpisodeTimes('No times here.')).toBe('No times here.');
  });
});

describe('timeFromLink', () => {
  it('reads a time link and ignores the rest', () => {
    expect(timeFromLink('oc-time:724')).toBe(724);
    expect(timeFromLink('https://example.com')).toBeNull();
    expect(timeFromLink('oc-time:soon')).toBeNull();
  });
});
