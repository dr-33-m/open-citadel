# Reanimated 4.6.0 / worklets 0.12.1 — done, with one patch to watch

Upgraded from 4.5.1 / 0.10.1 on 2026-08-31. This file is now a record of what
was changed and the one thing that needs re-checking on the next SDK bump.

| package | was | now |
| --- | --- | --- |
| `react-native-reanimated` | 4.5.1 | 4.6.0 |
| `react-native-worklets` | 0.10.1 | 0.12.1 |

`react-native@0.86.3` is inside 4.6.0's supported range (0.83 – 0.87), so RN did
not move.

## Why

`4.5.1` contains a three-thread deadlock in `ReanimatedCommitHook` — a hard ANR
with no crash. `maybeInitializeLayoutAnimations` enumerated the
`ShadowTreeRegistry` from inside a commit hook, which is a recursive shared
acquisition of the registry's `shared_mutex`; libc++ blocks new readers while a
writer is pending, so a concurrent `startSurface`/`stopSurface` wedged every
thread.

Upstream: [reanimated#8579](https://github.com/software-mansion/react-native-reanimated/issues/8579),
fixed by [PR #9903](https://github.com/software-mansion/react-native-reanimated/pull/9903).

**Verified in the installed 4.6.0**, not just assumed: the `enumerate` call has
moved into the `ReanimatedCommitHook` constructor ("We're not on a commit stack
here, so reading the registry is safe"), and the commit path now only calls
`surfaceTracker_->add(surfaceId)` via the new `ReanimatedSurfaceTracker.h`.
4.5.5 does **not** contain the fix; only the 4.6 line does.

## The patch this required — `patches/expo-modules-core.patch`

**This is the thing to re-check on every Expo SDK bump.**

`react-native-worklets` 0.12 removed `WorkletRuntime::executeSync`.
`expo-modules-core@57.0.14` calls it in
`android/src/main/cpp/worklets/WorkletJSCallInvoker.cpp`, so the Android build
fails to compile without the patch:

```
WorkletJSCallInvoker.cpp:27:21: error:
no member named 'executeSync' in 'worklets::WorkletRuntime'
```

The patch renames that one call to `runSync`. It is a rename, not a workaround:

- in 0.10.1 `executeSync(job)` was defined as literally `return runSync(job);`
- 0.12.1's `runSync(TJob&&)` documents "Does not run a microtask checkpoint",
  which is what 0.10.1's `runSync` did too — same lock, same skip
- `expo-modules-core` already calls `runSync` directly elsewhere
  (`Worklet.cpp:41`, `:79`)

`schedule`, `runSync` and `executeSync` are the only `WorkletRuntime` methods
that package calls, so this one line is the whole surface.

### On the next SDK bump (58+)

1. Drop the patch, install, build Android.
2. If it compiles, Expo has moved off `executeSync` upstream — delete
   `patches/expo-modules-core.patch` and its `patchedDependencies` entry.
3. If it still fails, re-apply and confirm `runSync` is still the equivalent.

`expo.install.exclude` in `package.json` holds `react-native-reanimated` and
`react-native-worklets` so `expo-doctor` stops flagging the deliberate step off
SDK 57's pins. Revisit that too when the SDK's own pins catch up to the 4.6
line.

## Other fixes picked up

All post-4.5.1, all in the "stale animated values" family:

- #9527 — animated views reverting to stale values after pause/re-animation
- #9926 — crash in `handleRawEvent` on a stale `EventTarget`
- #10127 — inline props mapper not restarting after remount
- #10140 — settled animated styles leaking to component props
- #10339 — per-view updates routed through one path

## Also checked and still correct

`patches/react-native-screen-transitions.patch` works around Reanimated 4's
`USE_SYNCHRONIZABLE_FOR_MUTABLES` making `.get()` block on a dirty value. On
4.6.0 that flag still defaults to `true` and `getSync()` is still the
non-blocking read (`mutables.native.ts`), so the patch is still both correct
and necessary. Note its `typeof getSync === "function"` guard fails *silently*
back to the blocking read — so if that method is ever renamed, the abort it
prevents returns with no compile error. Re-check it on Reanimated bumps.

One type error came with the upgrade: 4.6.0 types `Animated.View` so that a
bare `animate ? Animated.View : View` union has no call signature. Fixed in
`components/ui/scrim.tsx` with an explicit `ComponentType<LayerProps>`.

## Sanity check on device

Build up by opening several sheets and navigating around, enter a book, then
work the TOC sheet. Confirm screen transitions still animate and the reader's
entry skeleton hands over cleanly to the first page.
