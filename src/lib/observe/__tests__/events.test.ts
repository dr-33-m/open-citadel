import { describe, expect, it } from 'vitest';

import { elapsedMs, isNotAFault, replyOutcome, scrubMessage, severityOf } from '@/lib/observe/events';

describe('scrubMessage', () => {
  it('takes out addresses, file paths and emails, and keeps the kind of failure', () => {
    expect(scrubMessage('Could not fetch https://aeon.co/feed.rss?x=1 (timeout)')).toBe('Could not fetch <url> (timeout)');
    expect(scrubMessage('ENOENT: file:///data/user/0/app/files/books/My Diary.epub')).toBe('ENOENT: <path>');
    expect(scrubMessage("copy failed: 'content://com.android/My Book.epub' (denied)")).toBe("copy failed: '<path>' (denied)");
    expect(scrubMessage('open failed: /storage/emulated/0/Books/Private.epub')).toBe('open failed: <path>');
    expect(scrubMessage('no account for reader@example.com')).toBe('no account for <email>');
    expect(scrubMessage('Network request failed')).toBe('Network request failed');
  });
});

describe('severityOf', () => {
  it('raises failures and earlier deaths, and leaves the rest as info', () => {
    expect(severityOf({ name: 'book.import', attributes: { format: 'epub', ms: 1, outcome: 'failed' } })).toBe('error');
    expect(severityOf({ name: 'book.import', attributes: { format: 'epub', ms: 1, outcome: 'done' } })).toBe('info');
    expect(severityOf({ name: 'app.previous_exit', attributes: { cause: 'memory', reason: 3, status: 9, pssMb: 900 } })).toBe('warn');
  });
});

describe('elapsedMs', () => {
  it('rounds, and never goes below zero', () => {
    expect(elapsedMs(100, 350.6)).toBe(251);
    expect(elapsedMs(100, 50)).toBe(0);
  });
});

describe('isNotAFault', () => {
  it('leaves out being offline, timing out and cancelling', () => {
    expect(isNotAFault(new TypeError('Network request failed'))).toBe(true);
    expect(isNotAFault(new Error('XHR request failed: the stream closed'))).toBe(true);
    expect(isNotAFault(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true);
    expect(isNotAFault(new Error('Cancelled.'))).toBe(true);
  });

  it('keeps real faults', () => {
    expect(isNotAFault(new TypeError("Cannot read property 'id' of undefined"))).toBe(false);
    expect(isNotAFault('Model file is corrupt')).toBe(false);
  });
});

describe('replyOutcome', () => {
  it('says how a turn ended', () => {
    expect(replyOutcome(false, 120)).toBe('done');
    expect(replyOutcome(true, 40)).toBe('stopped');
    expect(replyOutcome(false, 0)).toBe('failed');
    expect(replyOutcome(false, 0, true)).toBe('limit');
  });
});
