import { describe, expect, it } from 'vitest';

import {
  CompassMorningTurnModelSchema,
  CompassMorningTurnSchema,
  normalizeCompassMorningTurn,
  type CompassMorningTurnModel,
} from 'samwell-shared';

function makeMissionStep(i: number) {
  return { title: `Step ${i}`, detail: `Do thing ${i}`, icon: 'target' as const, order: i };
}

function makeTurn(stepCount: number): CompassMorningTurnModel {
  return {
    reply: 'Here is the plan.',
    draft: {
      actions: [
        {
          description: 'Deep work block',
          category: 'execution',
          alignment: 'directly_aligned',
          minutes: 90,
          effortUnits: 2,
        },
      ],
      headline: 'Ship the milestone',
      mission: Array.from({ length: stepCount }, (_, i) => makeMissionStep(i + 1)),
      pitWallMessage: 'You are on pace.',
    },
  };
}

describe('CompassMorningTurnModelSchema', () => {
  it('accepts a mission longer than the wire contract allows', () => {
    expect(CompassMorningTurnModelSchema.safeParse(makeTurn(5)).success).toBe(true);
  });

  it('still rejects an empty mission', () => {
    const turn = makeTurn(1);
    if (turn.draft) turn.draft.mission = [];
    expect(CompassMorningTurnModelSchema.safeParse(turn).success).toBe(false);
  });

  it('still rejects an empty reply', () => {
    const turn = { ...makeTurn(2), reply: '' };
    expect(CompassMorningTurnModelSchema.safeParse(turn).success).toBe(false);
  });
});

describe('normalizeCompassMorningTurn', () => {
  it('trims a five-step mission down to the strict four-step contract', () => {
    const normalized = normalizeCompassMorningTurn(makeTurn(5));
    expect(normalized.draft?.mission).toHaveLength(4);
    expect(normalized.draft?.mission.map((step) => step.order)).toEqual([1, 2, 3, 4]);
    expect(CompassMorningTurnSchema.safeParse(normalized).success).toBe(true);
  });

  it('passes a null draft through untouched', () => {
    const normalized = normalizeCompassMorningTurn({ reply: 'Tell me more.', draft: null });
    expect(normalized).toEqual({ reply: 'Tell me more.', draft: null });
    expect(CompassMorningTurnSchema.safeParse(normalized).success).toBe(true);
  });

  it('keeps a four-step mission as-is', () => {
    const normalized = normalizeCompassMorningTurn(makeTurn(4));
    expect(normalized.draft?.mission).toHaveLength(4);
  });
});
