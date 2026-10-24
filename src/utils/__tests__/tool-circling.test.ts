import { describe, expect, it } from 'vitest';

import { callSignature, createCircleWatch } from '../tool-circling';

describe('callSignature', () => {
  it('ignores key order and spacing', () => {
    expect(callSignature('search', '{"q":"war","limit":5}')).toBe(callSignature('search', '{ "limit": 5, "q": "war" }'));
  });

  it('tells different inputs apart', () => {
    expect(callSignature('search', '{"q":"war"}')).not.toBe(callSignature('search', '{"q":"peace"}'));
  });

  it('copes with input that is not JSON', () => {
    expect(callSignature('search', ' war ')).toBe('search:war');
  });
});

describe('createCircleWatch', () => {
  it('lets many different calls through', () => {
    const watch = createCircleWatch();
    for (let i = 0; i < 40; i += 1) {
      expect(watch.record(`call-${i}`, 'read_chapter', JSON.stringify({ book: i }))).toBe(false);
    }
  });

  it('calls the same call a third time circling', () => {
    const watch = createCircleWatch();
    expect(watch.record('a', 'search', '{"q":"war"}')).toBe(false);
    expect(watch.record('b', 'search', '{"q":"war"}')).toBe(false);
    expect(watch.record('c', 'search', '{"q":"war"}')).toBe(true);
  });

  it('counts one call once, however often it is seen', () => {
    const watch = createCircleWatch();
    for (let i = 0; i < 5; i += 1) expect(watch.record('a', 'search', '{"q":"war"}')).toBe(false);
  });
});
