import { z } from 'zod';

/**
 * What the app's short free-text fields will accept.
 *
 * One place, because "is this empty" was being decided independently at every
 * save site — six copies of `value.trim()` followed by a silent `return`, each
 * free to disagree about whitespace, and none of them able to tell the button
 * above it that the press would do nothing. The rule lives here now and both
 * layers read it: the control uses it to disable itself, the handler uses it
 * to refuse.
 *
 * `.trim()` runs BEFORE `.min(1)` in Zod, so a field holding only spaces or a
 * newline fails — which is the case the hand-rolled checks were actually for.
 *
 * The maximums are not arbitrary limits on what someone may write; they are
 * the point past which a field has stopped being the thing it is named for and
 * is almost certainly a paste accident. They are generous on purpose.
 */

/** A note on a highlight, or on a day's log. */
export const NoteText = z.string().trim().min(1).max(2000);

/** A thought in the timeline — the longest thing anyone writes by hand here. */
export const ThoughtText = z.string().trim().min(1).max(10000);

/** A book's title, as corrected by hand. */
export const TitleText = z.string().trim().min(1).max(300);

/** The name of a collection. */
export const CollectionName = z.string().trim().min(1).max(120);

/**
 * Why a goal was stopped early.
 *
 * Required, which is a deliberate reversal. It was optional at first, on the
 * reasoning that holding a goal hostage to a paragraph is how dead goals end
 * up sitting in the list forever. But this sentence is the single most useful
 * thing in the archive — no amount of logged data reconstructs "the plan was
 * wrong for my week", and nobody remembers it in four months — and a goal is
 * stopped once. Asking for one line at that moment is worth it.
 */
export const GoalStopReason = z.string().trim().min(1).max(1000);

/**
 * Whether a field's current contents may be saved.
 *
 * For the sites that already hold their text in state. The uncontrolled ones —
 * where a keystroke must not re-render the screen — use `useTextValidity`,
 * which reads the same schemas.
 */
export function isFilled(schema: z.ZodType<string>, value: string): boolean {
  return schema.safeParse(value).success;
}
