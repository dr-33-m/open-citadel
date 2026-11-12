import { describe, expect, it } from 'vitest';

import { draftDoneLabel, draftLandedMessage } from '../draft-landed';

const plan = { kind: 'plan', proposal: { title: 'Read 15 pages a day for 7 days' } } as never;
const checkin = (n: number) =>
  ({ kind: 'checkin', draft: { journeyNote: null, adjustments: Array.from({ length: n }, () => ({})) } }) as never;

describe('draftLandedMessage', () => {
  it('names the goal that just started', () => {
    expect(draftLandedMessage(plan)).toBe('Goal started: Read 15 pages a day for 7 days');
  });

  it('counts the changes a check-in made', () => {
    expect(draftLandedMessage(checkin(1))).toBe('Change saved');
    expect(draftLandedMessage(checkin(3))).toBe('3 changes saved');
  });

  it('says something even when a check-in only kept a note', () => {
    expect(draftLandedMessage(checkin(0))).toBe('Noted');
  });
});

describe('draftDoneLabel', () => {
  const applied = (draft: object) => ({ ...draft, applied: true }) as never;

  it('is null while the card still waits for an answer', () => {
    expect(draftDoneLabel(null)).toBeNull();
    expect(draftDoneLabel(plan)).toBeNull();
    expect(draftDoneLabel(checkin(2))).toBeNull();
  });

  it('says what an approved card did', () => {
    expect(draftDoneLabel(applied(plan))).toBe('GOAL STARTED');
    expect(draftDoneLabel(applied(checkin(2)))).toBe('CHANGES SAVED');
    expect(draftDoneLabel(applied(checkin(0)))).toBe('NOTE KEPT');
  });
});
