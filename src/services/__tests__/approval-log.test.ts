import { describe, expect, it } from 'vitest';

import { formatPubDate } from '@/utils/pub-date';
import { logAmountPhrase, logApprovalBody, logDayPhrase } from '@/services/approval-copy/log';

// Monday 9 November 2026, mid-afternoon local.
const now = new Date(2026, 10, 9, 15, 0, 0);

describe('logDayPhrase', () => {
  it('says today and yesterday as words', () => {
    expect(logDayPhrase(undefined, now)).toBe('today');
    expect(logDayPhrase('2026-11-09', now)).toBe('today');
    expect(logDayPhrase('2026-11-08', now)).toBe('yesterday');
  });

  it('says an older day as the app says days elsewhere', () => {
    expect(logDayPhrase('2026-10-20', now)).toBe(`on ${formatPubDate('2026-10-20T12:00:00', now)}`);
  });

  it('says a day it cannot read as it came, rather than guessing', () => {
    expect(logDayPhrase('last tuesday', now)).toBe('on last tuesday');
  });
});

describe('logAmountPhrase', () => {
  it("takes the trackable's own unit", () => {
    expect(logAmountPhrase(15, { type: 'QUANTITY', target: 15, unit: 'pages' })).toBe('15 pages');
    expect(logAmountPhrase(30, { type: 'DURATION', target: 30, unit: 'minutes' })).toBe('30 minutes');
    expect(logAmountPhrase(4, { type: 'RATING', min: 1, max: 5 })).toBe('4 of 5');
  });

  it('says no number for a log that is only done or not', () => {
    expect(logAmountPhrase(1, { type: 'COMPLETION' })).toBeNull();
    expect(logAmountPhrase(undefined, { type: 'QUANTITY', target: 15, unit: 'pages' })).toBeNull();
  });
});

describe('logApprovalBody', () => {
  const measurement = { type: 'QUANTITY', target: 15, unit: 'pages' } as const;

  it('reads as a sentence, not as the tool call', () => {
    expect(logApprovalBody({ title: 'Read 15 pages', date: '2026-11-09', value: 15, measurement, now })).toBe(
      'Samwell wants to log "Read 15 pages" as done today: 15 pages.',
    );
  });

  it('says a miss, with its reason', () => {
    expect(logApprovalBody({ title: 'Run', outcome: 'MISSED', date: '2026-11-08', note: 'Rained all day', now })).toBe(
      'Samwell wants to log that "Run" did not happen yesterday. Note: "Rained all day"',
    );
  });
});
