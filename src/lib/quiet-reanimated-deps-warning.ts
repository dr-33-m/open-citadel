/**
 * Collapses Reanimated 4.6's "dependencies should only be used in web
 * implementation" warning to a single line per session.
 *
 * **What it is.** 4.6 started warning whenever `useAnimatedStyle`,
 * `useDerivedValue`, `useAnimatedReaction` or `useHandler` is given a
 * dependency array on native, where deps are a web-only concept. 4.5.1, which
 * this app ran until the worklets upgrade, did not warn at all.
 *
 * **Why it is not ours to fix.** Our own source passes deps to none of those
 * hooks. Every copy of this warning comes from a library that has not caught up
 * yet — `@gorhom/bottom-sheet` alone has 26 such call sites, plus
 * `react-native-keyboard-controller`, `react-native-drawer-layout` and
 * `react-native-screen-transitions`. It fires on every render of a mounted
 * sheet, which is often enough to bury everything else in the console.
 *
 * **Why not the documented opt-out.** Reanimated's own advice is to turn off
 * `strict` mode, but that does not work here: this warning is logged with no
 * options, so `options.strict` is undefined and the strict gate never applies
 * to it. Raising the log level to `error` would silence it, but it would also
 * silence the other sixty warnings — including "Reading from `value` during
 * component render", which is the one mistake in this codebase most worth
 * being told about. Turning `strict` off loses that same pair. So neither knob
 * can express "quiet this one".
 *
 * **Why here rather than a patch.** Patching Reanimated would mean a second
 * native-package patch to re-verify on every upgrade, for a message that only
 * exists in `__DEV__` and never ships. This lives in our own source where it
 * can be read and deleted.
 *
 * The first copy is still printed, because the day one of these comes from our
 * code is the day we want to hear about it. Re-check with a scan for those four
 * hooks taking a deps array before assuming a new one is upstream's.
 *
 * Delete this once the libraries drop their dependency arrays.
 *
 * Imported for its side effect, like `global.css` — the install has to happen
 * before the first render, and an import is the one thing guaranteed to be
 * evaluated before the module body of whatever imports it.
 */
const MESSAGE = 'dependencies should only be used in web implementation';

/** Marks the console as already wrapped, so Fast Refresh cannot stack layers. */
const INSTALLED = '__openCitadelQuietedReanimatedDeps';

function install() {
  if (!__DEV__) return;

  // Fast Refresh re-evaluates this module on every reload, and a naive install
  // would wrap the console.warn installed by the previous one — a new layer per
  // reload, each delegating to the last, and the "suppressed" notice printing
  // once per layer. The flag lives on the console function itself rather than in
  // module scope, because module scope is exactly what gets replaced.
  const current = console.warn as typeof console.warn & { [INSTALLED]?: true };
  if (current[INSTALLED]) return;

  let seen = false;
  const wrapped = ((...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string' && first.includes(MESSAGE)) {
      if (seen) return;
      seen = true;
      current(
        `${first}\n[open-citadel] Further copies of this warning are suppressed — ` +
          'it comes from libraries passing deps to Reanimated hooks, not from our ' +
          'own code. See lib/quiet-reanimated-deps-warning.',
      );
      return;
    }
    // `apply`, not a bare call: React Native replaces the console methods and
    // some of those implementations read `this`.
    current.apply(console, args as Parameters<typeof console.warn>);
  }) as typeof console.warn & { [INSTALLED]?: true };

  wrapped[INSTALLED] = true;
  console.warn = wrapped;
}

install();
