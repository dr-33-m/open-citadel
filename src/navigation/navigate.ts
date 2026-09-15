import type { Href, ImperativeRouter } from 'expo-router';

/**
 * Go back, or go to `fallback` if there is nowhere to go back to.
 *
 * Every screen off the Library has a button that means "return to the
 * Library", and for the usual path — opened from the Library — that is a pop,
 * which keeps the hub exactly as it was left. But a screen can also be the
 * *first* screen: a notification or a deep link can land straight on Samwell,
 * and there a bare `back()` is a silent no-op that leaves the button looking
 * broken. Falling through to a navigation gives the same outcome from a cold
 * start, just without the stack to pop.
 */
export function backTo(router: ImperativeRouter, fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
