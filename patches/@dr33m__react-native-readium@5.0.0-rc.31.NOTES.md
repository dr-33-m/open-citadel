# Fork fixes needed — upstream into `@dr33m/react-native-readium`

The patch in this directory (`@dr33m__react-native-readium@5.0.0-rc.31.patch`) is a
stopgap applied via `pnpm patch`. It should be ported into the fork's source
directly, then this patch dropped once the app's dependency is bumped to the
version that includes the fix.

## What's wrong

**File:** `ios/HybridReadiumView.swift`, function `ttsStart(config:)`

TTS always started from the **beginning of the publication** instead of the
reader's current page. Root cause: `ttsStart` called

```swift
manager.start(rate: rate, language: language, voice: voice, fromLocator: nil)
```

`TTSManager.start` (`ios/Reader/TTS/TTSManager.swift`) falls back to
`synth.start()` (from the start of the book) whenever `fromLocator` is `nil`.
Android's equivalent path does pass a starting locator, so this was iOS-only.

## What the fix does

```swift
Task { @MainActor [weak self] in
  guard let self = self else { return }
  guard let manager = self.ensureTTSManager() else { return }

  var fromLocator: RLocator? = nil
  if let visual = self.readerViewController?.navigator as? VisualNavigator {
    fromLocator = await visual.firstVisibleElementLocator()
  }
  if fromLocator == nil {
    fromLocator = self.readerViewController?.navigator.currentLocation
  }

  manager.start(rate: rate, language: language, voice: voice, fromLocator: fromLocator)
}
```

Two things worth knowing if you touch this again:

1. **Don't use `navigator.currentLocation` as the primary source.** It was the
   first fix attempted and it's wrong — in a paginated EPUB it's a coarse,
   resource-level progression (a percentage through the current chapter file
   derived from scroll offset), and `PublicationSpeechSynthesizer.start(from:)`
   maps that back to text imprecisely. In testing it started TTS ~2 pages
   before the visible page.
2. **`VisualNavigator.firstVisibleElementLocator()` is correct.** It returns a
   locator anchored to the actual first DOM element visible on screen. This is
   the same approach Readium's own Swift TestApp uses in `TTSViewModel` for
   exactly this reason. It's an `async` API on Readium Swift 3.5.x (the version
   this podspec pins), hence the `await` — safe here since the whole block runs
   on `@MainActor`.

`currentLocation` is kept only as a fallback for the edge case where the
navigator isn't a `VisualNavigator` or `firstVisibleElementLocator()` returns
`nil` (e.g. very early in layout) — better than nothing, matching the old
(fully broken) behavior at worst.

## Once ported upstream

- Bump `@dr33m/react-native-readium` in `open-citadel/package.json`.
- Remove the `@dr33m/react-native-readium@5.0.0-rc.31` entry from
  `patchedDependencies` in `package.json`.
- Delete `@dr33m__react-native-readium@5.0.0-rc.31.patch` and this file.
- Run `pnpm install` and rebuild iOS to confirm.
