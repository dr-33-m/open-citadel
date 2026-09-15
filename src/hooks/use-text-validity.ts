import React from 'react';
import type { z } from 'zod';

/**
 * Whether an uncontrolled field currently holds something saveable.
 *
 * Deliberately does NOT own the text. Every sheet and dialog in this app keeps
 * its field uncontrolled — the value lives in the native buffer and React only
 * mirrors it out, because controlled, a keystroke landing mid-render is
 * committed over by a stale string and the letter drops. Whoever already owns
 * that mirror keeps owning it; this adds the one derived fact a Save button
 * needs, and nothing else.
 *
 * The reason it is a hook rather than `isFilled(schema, ref.current)` is that
 * a ref changing does not re-render, so a button reading one would never
 * un-grey itself. The reason it is cheap is that it only sets state on the
 * EDGE: `setState` with the value it already holds is a bail-out in React, so
 * typing a sentence re-renders exactly once — on the first character — and
 * deleting it re-renders once more.
 *
 * ```tsx
 * const note = useTextValidity(NoteText);
 * <TextInput defaultValue="" onChangeText={(t) => { ref.current = t; note.check(t); }} />
 * <Button disabled={!note.isValid} />
 * ```
 */
export function useTextValidity(schema: z.ZodType<string>, initial = '') {
  const [isValid, setIsValid] = React.useState(() => schema.safeParse(initial).success);

  const check = React.useCallback(
    (next: string) => {
      const ok = schema.safeParse(next).success;
      setIsValid((was) => (was === ok ? was : ok));
    },
    [schema],
  );

  /** Put it back to empty when the surface is reopened for something else. */
  const reset = React.useCallback(
    (to = '') => setIsValid(schema.safeParse(to).success),
    [schema],
  );

  return { isValid, check, reset };
}
