/**
 * What to do with a link the OS hands the app.
 *
 * Only one thing so far, and it is a link that must go nowhere.
 *
 * ## Why the sign-in callback needs swallowing
 *
 * `opencitadel://callback` is the redirect Logto sends the browser back to
 * when sign-in finishes — see `ACCOUNT_REDIRECT_URI`. Two things listen for
 * it, and both fire:
 *
 * 1. `expo-web-browser`, which registers its own `Linking` subscription and
 *    resolves the auth session with the URL. This is the one that matters:
 *    it is how the tokens get exchanged.
 * 2. Expo Router, which sees a deep link, looks for a route called
 *    `callback`, finds none, and shows "Unmatched Route".
 *
 * So the reader finishes signing in and lands on a debug screen. Worse on the
 * failure path, which is where this was caught: Logto redirects back with
 * `?error=...`, the account card has something useful to say about it, and
 * nobody can see it because the router has left the app.
 *
 * Returning null stops the router navigating (see its `subscribe`, which only
 * calls the listener `if (href)`). It does not unsubscribe anybody else —
 * `expo-web-browser`'s handler is a separate listener on the same event and
 * still receives it, so sign-in completes exactly as before. Verified in
 * `expo-web-browser`'s `_waitForRedirectAsync` rather than assumed, because
 * getting this wrong would break sign-in silently.
 *
 * Everything else is passed through untouched.
 */

/** The one path that belongs to the browser and not to the router. */
const AUTH_CALLBACK = 'callback';

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  /*
   * `opencitadel://callback` puts `callback` in the HOST, not the path —
   * there is no third slash — while `opencitadel:///callback` puts it in the
   * path. Both forms are in the wild (`Linking.createURL` emits the second),
   * so strip the scheme and any leading slashes and read the first segment,
   * which is the same answer either way.
   */
  const firstSegment = path
    .replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '')
    .replace(/^\/+/, '')
    .split(/[/?#]/)[0];

  return firstSegment === AUTH_CALLBACK ? null : path;
}
