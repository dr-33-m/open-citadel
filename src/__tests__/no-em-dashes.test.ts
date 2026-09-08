import * as shared from 'samwell-shared';

import { describe, expect, it } from 'vitest';

/**
 * Samwell is told never to use an em dash, and then shown a great many.
 *
 * `SAMWELL_CHARACTER` ends with "Never use em dashes", and the house style in
 * CLAUDE.md says the same for anything a reader sees. Both were true and both
 * were being undercut by the prompts themselves: the app guide, which is
 * inlined into the onboarding prompt AND handed back by `explain_app`, used
 * them in its headings, and fifteen tool descriptions used them in prose. A
 * model imitates what it reads far more reliably than it obeys what it is
 * told, so every one of those was a worked example of the rule being broken.
 *
 * This test reads the real exported values rather than parsing the source,
 * which matters more than it sounds. The obvious version greps the files, and
 * grep cannot tell a comment from a string: em dashes ARE allowed in code
 * comments, and a scan written for this found ten false positives in two files
 * whose regex literals confused its parser. Walking the exports has no such
 * ambiguity. What it checks is exactly what reaches the model.
 */

/** An em dash, written as an escape so this file does not contain one. */
const EM_DASH = '—';

/**
 * Every string reachable from an exported value.
 *
 * Prompts are plain constants, but tool descriptions live on definition
 * objects and the per-field guidance from `.describe()` lives inside zod's
 * internals, so a walk finds more than a hand-written list would, and does not
 * rot when a tool is added. Depth-capped and cycle-guarded because zod schemas
 * hold references back to themselves.
 */
function stringsIn(value: unknown, path: string, seen: WeakSet<object>, depth = 0): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (depth > 8 || value === null || typeof value !== 'object') return [];
  if (seen.has(value)) return [];
  seen.add(value);

  const found: [string, string][] = [];
  if (Array.isArray(value)) {
    value.forEach((entry, i) => found.push(...stringsIn(entry, `${path}[${i}]`, seen, depth + 1)));
    return found;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    found.push(...stringsIn(entry, `${path}.${key}`, seen, depth + 1));
  }
  return found;
}

describe('prompt text', () => {
  const seen = new WeakSet<object>();
  const strings = Object.entries(shared).flatMap(([name, value]) =>
    stringsIn(value, name, seen),
  );

  it('finds the prompts to check', () => {
    // A guard on the walk itself: if an export shape changes and this starts
    // finding nothing, the test would pass by looking at nothing at all.
    expect(strings.length).toBeGreaterThan(200);
    expect(shared.SAMWELL_CHARACTER).toContain('Never use em dashes');
  });

  it('never shows Samwell the punctuation he is told not to use', () => {
    const offenders = strings
      .filter(([, text]) => text.includes(EM_DASH))
      .map(([path, text]) => {
        const at = text.indexOf(EM_DASH);
        return `${path}: ...${text.slice(Math.max(0, at - 50), at + 50)}...`;
      });
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
