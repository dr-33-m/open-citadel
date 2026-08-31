import { startTransition, useEffect, useState } from 'react';

/**
 * True from the frame after this screen's first paint.
 *
 * This is the signal for "the shell is on screen, do the expensive part now".
 * A heavy screen that renders everything in one pass blocks the navigator
 * before it has anything to animate, so the app freezes for the length of the
 * mount and only then starts moving. Splitting the render in two — a light
 * shell now, the body on the next frame — lets the push begin immediately and
 * pays the mount cost while the screen is already travelling.
 *
 * One frame, deliberately, rather than waiting for the transition to finish.
 * The transition is a worklet driving a spring on the UI thread, so it does
 * not care that the JS thread is busy mounting; the body can arrive during
 * the motion and be settled and readable by the time the screen lands. Gating
 * on the *end* of the transition was the previous design, and it cost the
 * user half a second of placeholder on a screen whose content was ready long
 * before — the wait was the gate, not the work.
 *
 * Two frames, not one: the first `requestAnimationFrame` fires before the
 * commit this render belongs to has been painted, so scheduling from inside it
 * is what actually puts the work after the shell is visible.
 *
 * The flip is a Transition (the Expensify app's `NavigationDeferredMount` does
 * the same): the deferred body is explicitly non-urgent, so React can keep
 * yielding to the transition gesture and any taps while that subtree hydrates.
 */
export function useAfterFirstPaint(): boolean {
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => startTransition(() => setPainted(true)));
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
    };
  }, []);

  return painted;
}
