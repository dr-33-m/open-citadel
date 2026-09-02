import { describe, expect, it } from 'vitest';
import {
  GoalProposalSchema,
  MAX_TRACKABLES,
  normalizeCompassCheckinTurn,
  normalizeCompassPlanTurn,
  normalizeMeasurement,
  normalizeSchedule,
  type CompassPlanTurnModel,
} from 'samwell-shared';

/**
 * The model answers in a flat, every-key-nullable shape and the normalizer
 * rebuilds the strict contract from it. This is where that promise is kept or
 * broken, and it is a far better reliability test than calling the live route
 * and hoping the model misbehaves on cue.
 */

const CTX = { today: '2026-09-01', timezone: 'Africa/Harare' };

function schedule(over: Record<string, unknown> = {}) {
  return {
    type: 'DAILY',
    daysOfWeek: null,
    target: null,
    dates: null,
    intervalDays: null,
    ...over,
  } as never;
}

function measurement(over: Record<string, unknown> = {}) {
  return { type: 'COMPLETION', target: null, unit: null, min: null, max: null, ...over } as never;
}

function trackable(over: Record<string, unknown> = {}) {
  return {
    title: 'Publish a video',
    description: null,
    startOffsetDays: 0,
    durationDays: null,
    timeOfDay: null,
    schedule: schedule(),
    measurement: measurement(),
    ...over,
  };
}

function planTurn(draft: Record<string, unknown> | null): CompassPlanTurnModel {
  return {
    reply: 'Here is what I would track.',
    draft:
      draft === null
        ? null
        : ({
            title: 'Make $4,000',
            summary: 'Four thousand dollars from Open Citadel by December.',
            category: 'BUSINESS',
            priority: 'HIGH',
            durationDays: 120,
            outcomeTarget: null,
            outcomeUnit: null,
            rationale: null,
            trackables: [trackable()],
            ...draft,
          } as never),
  } as CompassPlanTurnModel;
}

describe('normalizeSchedule', () => {
  it('drops keys that do not belong to the chosen type', () => {
    // A DAILY schedule carrying daysOfWeek is the single most common way a
    // model gets the flat shape wrong.
    const result = normalizeSchedule(schedule({ type: 'DAILY', daysOfWeek: [1, 3], target: 6 }), CTX);
    expect(result).toEqual({ type: 'DAILY', timezone: CTX.timezone });
  });

  it('rescues WEEKLY_DAYS, deduping and sorting the days', () => {
    const result = normalizeSchedule(
      schedule({ type: 'WEEKLY_DAYS', daysOfWeek: [5, 1, 1, 9, -2, 3] }),
      CTX,
    );
    expect(result).toEqual({ type: 'WEEKLY_DAYS', daysOfWeek: [1, 3, 5], timezone: CTX.timezone });
  });

  it('downgrades an unsalvageable WEEKLY_DAYS to DAILY rather than failing', () => {
    const result = normalizeSchedule(schedule({ type: 'WEEKLY_DAYS', daysOfWeek: [] }), CTX);
    expect(result.type).toBe('DAILY');
  });

  it('clamps weekly and monthly targets into range', () => {
    expect(normalizeSchedule(schedule({ type: 'WEEKLY_TARGET', target: 40 }), CTX)).toMatchObject({
      target: 7,
    });
    expect(normalizeSchedule(schedule({ type: 'WEEKLY_TARGET', target: 0 }), CTX)).toMatchObject({
      target: 1,
    });
    expect(normalizeSchedule(schedule({ type: 'MONTHLY_TARGET', target: 99 }), CTX)).toMatchObject({
      target: 31,
    });
  });

  it('filters garbage out of SPECIFIC_DATES and sorts what is left', () => {
    const result = normalizeSchedule(
      schedule({
        type: 'SPECIFIC_DATES',
        dates: ['2026-10-02', 'next tuesday', '2026-09-05', '', '2026-09-05'],
      }),
      CTX,
    );
    expect(result).toMatchObject({ dates: ['2026-09-05', '2026-10-02'] });
  });

  it('falls back to DAILY when every date was garbage', () => {
    expect(
      normalizeSchedule(schedule({ type: 'SPECIFIC_DATES', dates: ['soon', 'later'] }), CTX).type,
    ).toBe('DAILY');
  });

  it('collapses an every-1-day interval to DAILY, keeping one meaning per shape', () => {
    expect(normalizeSchedule(schedule({ type: 'INTERVAL', intervalDays: 1 }), CTX).type).toBe('DAILY');
    expect(normalizeSchedule(schedule({ type: 'INTERVAL', intervalDays: 3 }), CTX)).toMatchObject({
      intervalDays: 3,
    });
    expect(normalizeSchedule(schedule({ type: 'INTERVAL', intervalDays: 0 }), CTX).type).toBe('DAILY');
  });

  it('always fills the timezone from the request', () => {
    expect(normalizeSchedule(schedule(), CTX)).toMatchObject({ timezone: 'Africa/Harare' });
  });
});

describe('normalizeMeasurement', () => {
  it('keeps a well-formed quantity', () => {
    expect(measurementOf({ type: 'QUANTITY', target: 6, unit: 'videos' })).toEqual({
      type: 'QUANTITY',
      target: 6,
      unit: 'videos',
    });
  });

  it('falls back to COMPLETION when a value measurement has no target or unit', () => {
    expect(measurementOf({ type: 'QUANTITY', target: null, unit: 'videos' }).type).toBe('COMPLETION');
    expect(measurementOf({ type: 'QUANTITY', target: 6, unit: null }).type).toBe('COMPLETION');
    expect(measurementOf({ type: 'AMOUNT', target: 0, unit: 'USD' }).type).toBe('COMPLETION');
  });

  it('forces a duration unit to minutes or hours', () => {
    expect(measurementOf({ type: 'DURATION', target: 30, unit: 'mins' })).toMatchObject({
      unit: 'minutes',
    });
    expect(measurementOf({ type: 'DURATION', target: 2, unit: 'hours' })).toMatchObject({
      unit: 'hours',
    });
  });

  it('defaults a rating to 1..5 and repairs an inverted range', () => {
    expect(measurementOf({ type: 'RATING', min: null, max: null })).toEqual({
      type: 'RATING',
      min: 1,
      max: 5,
    });
    expect(measurementOf({ type: 'RATING', min: 5, max: 1 })).toEqual({
      type: 'RATING',
      min: 1,
      max: 5,
    });
  });

  it('drops the target a completion should never have carried', () => {
    expect(measurementOf({ type: 'COMPLETION', target: 12, unit: 'videos' })).toEqual({
      type: 'COMPLETION',
    });
  });
});

function measurementOf(over: Record<string, unknown>) {
  return normalizeMeasurement(measurement(over));
}

describe('normalizeCompassPlanTurn', () => {
  it('passes a null draft through untouched', () => {
    const result = normalizeCompassPlanTurn(planTurn(null), CTX);
    expect(result.draft).toBeNull();
    expect(result.reply).toBe('Here is what I would track.');
  });

  it('produces something the STRICT schema accepts, from thoroughly wrong input', () => {
    // Every failure mode at once. The point is that one bad field must not
    // cost the reader the whole conversation.
    const result = normalizeCompassPlanTurn(
      planTurn({
        trackables: [
          trackable({ schedule: schedule({ type: 'DAILY', daysOfWeek: [1, 2], target: 9 }) }),
          trackable({ schedule: schedule({ type: 'WEEKLY_DAYS', daysOfWeek: [] }) }),
          trackable({ schedule: schedule({ type: 'WEEKLY_TARGET', target: 99 }) }),
          trackable({ schedule: schedule({ type: 'SPECIFIC_DATES', dates: ['nope'] }) }),
          trackable({ measurement: measurement({ type: 'RATING' }) }),
          trackable({ measurement: measurement({ type: 'QUANTITY', target: null }) }),
        ],
      }),
      CTX,
    );
    expect(GoalProposalSchema.safeParse(result.draft).success).toBe(true);
  });

  it('caps the trackables at five, however many the model sent', () => {
    const result = normalizeCompassPlanTurn(
      planTurn({ trackables: Array.from({ length: 9 }, () => trackable()) }),
      CTX,
    );
    expect(result.draft?.trackables).toHaveLength(MAX_TRACKABLES);
    expect(GoalProposalSchema.safeParse(result.draft).success).toBe(true);
  });

  it('keeps an outcome only when both halves are present', () => {
    const both = normalizeCompassPlanTurn(
      planTurn({ outcomeTarget: 4000, outcomeUnit: 'USD' }),
      CTX,
    );
    expect(both.draft).toMatchObject({ outcomeTarget: 4000, outcomeUnit: 'USD' });

    // Half an outcome is noise: a number with no unit cannot be rendered and
    // cannot be summed against anything.
    const half = normalizeCompassPlanTurn(planTurn({ outcomeTarget: 4000, outcomeUnit: null }), CTX);
    expect(half.draft?.outcomeTarget).toBeNull();
    expect(half.draft?.outcomeUnit).toBeNull();
  });

  it('fills the timezone into every trackable schedule', () => {
    const result = normalizeCompassPlanTurn(planTurn({}), CTX);
    expect(result.draft?.trackables[0].schedule.timezone).toBe('Africa/Harare');
  });
});

describe('normalizeCompassCheckinTurn', () => {
  const adjustment = (over: Record<string, unknown> = {}) => ({
    trackableId: 't1',
    action: 'PAUSE' as const,
    target: null,
    reason: 'You are travelling this week.',
    ...over,
  });

  it('drops an adjustment naming a trackable that does not exist', () => {
    // Otherwise the reader is shown a button that cannot do anything.
    const result = normalizeCompassCheckinTurn(
      { reply: 'ok', draft: { journeyNote: null, adjustments: [adjustment({ trackableId: 'ghost' })] } },
      ['t1'],
    );
    expect(result.draft).toBeNull();
  });

  it('keeps the ones that do exist, capped at three', () => {
    const result = normalizeCompassCheckinTurn(
      {
        reply: 'ok',
        draft: {
          journeyNote: null,
          adjustments: [
            adjustment({ trackableId: 't1' }),
            adjustment({ trackableId: 't2' }),
            adjustment({ trackableId: 't3' }),
            adjustment({ trackableId: 't4' }),
          ],
        },
      },
      ['t1', 't2', 't3', 't4'],
    );
    expect(result.draft?.adjustments).toHaveLength(3);
  });

  it('keeps a note-only draft', () => {
    const result = normalizeCompassCheckinTurn(
      { reply: 'ok', draft: { journeyNote: 'Editing is the bottleneck, not ideas.', adjustments: [] } },
      ['t1'],
    );
    expect(result.draft?.journeyNote).toBe('Editing is the bottleneck, not ideas.');
  });

  it('returns no draft at all when nothing survived', () => {
    const result = normalizeCompassCheckinTurn(
      { reply: 'ok', draft: { journeyNote: null, adjustments: [] } },
      ['t1'],
    );
    expect(result.draft).toBeNull();
  });
});
