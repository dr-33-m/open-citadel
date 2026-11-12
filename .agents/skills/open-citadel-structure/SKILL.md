---
name: open-citadel-structure
description: Open Citadel's house rules for how code is split and where it lives - small presentational components, logic in hooks, pure decisions in tested utils, I/O in services, one shared copy of every decision, no monolith files. Use when writing or refactoring any screen, component, hook, store or service in Open Citadel, when a file passes its size budget, when adding a feature folder, or when reviewing code for structure.
---

# Open Citadel structure

CLAUDE.md states the rules; this is how to follow them. The owner does not
want monolith files. A file that does two jobs is two files.

## The layers

Every screen is built from the same four layers, and each has one job.

| Layer | Lives in | Does | Never |
|---|---|---|---|
| Route or hub page | `app/**`, `components/hub/*-page.tsx` | Calls hooks, hands their results to components | Holds logic worth a name |
| Screen hook | `features/<f>/hooks/use-<screen>.ts` | State, store selectors, router, handlers, derived values | Renders |
| Component | `features/<f>/components/` | Renders props | Reaches into a store, the router, a service or the db |
| Pure decision | `features/<f>/utils/`, `utils/` | "Which rows does this menu have", "what does this code mean" | Imports React Native, does I/O |

I/O is `services/`. Client state and the actions that change it are
`stores/`. Data read from the database or the network goes through TanStack
Query, set up in `query-manager/` (next section), never a `useEffect` that
fills `useState`.

Worked examples in the repo, to copy rather than reinvent:
- Screen: `app/section/[type].tsx` + `features/library/hooks/use-book-section.ts` + `BookGrid`/`DrawerHeader`.
- Hub side: `components/hub/books-page.tsx` + `useBooksLibrary` + `BooksLibrary` (presentational).
- Pure decision: `features/library/utils/book-menu.ts` + `MenuList` + `BookActionSheet`.
- Service split: `services/podcasts/player/` (session, media, lifecycle, controls, events) behind `player.ts`.

## Data: TanStack Query and `query-manager/`

The same layout as cr8-app. One folder per domain:

```
src/query-manager/<domain>/
  keys.ts      podcastKeys.all / .library() / .show(id) ... (as const arrays)
  options.ts   createXQueryOptions(params, options?) => { staleTime, gcTime, ...options, queryKey, queryFn } satisfies UseQueryOptions
  index.ts     re-exports
```

- `useQuery`, `useQueries` and `useMutation` live in feature hooks, never in components, and hooks only ever build a query from a `create…QueryOptions` factory, so one key has one fetch function and one cache policy.
- **Local data (SQLite)** uses `staleTime: Infinity`, `networkMode: 'always'`, and sits under one parent key (`podcastKeys.library()`). Every write ends with one invalidation of that key (`invalidatePodcastLibrary()`, callable from services). Nothing polls.
- **Network data** gets a real `staleTime`/`gcTime` for how fast it changes (charts: 6h fresh, 24h kept) and passes the query's `signal` through to `fetch`. The query layer is the only cache; a service does not keep its own.
- **Anything that writes** (fetching and storing a new show) sits outside the library key, so an invalidation never runs it again.
- **Writes the UI waits on** are `useMutation` (follow, refresh, import): `isPending` is the spinner and blocks a second press. Fire-and-forget actions stay plain service calls that invalidate when they land.
- **Prefetch at the tap**: the handler that navigates calls `queryClient.prefetchQuery(create…QueryOptions(id))` before `router.push`, so the page arrives with its data. One cache entry can serve a shelf and its "View all" (the shelf uses `select` or a slice).
- Components get `data ?? EMPTY` from the hook plus a `loaded` flag; a first load shows a skeleton the shape of the content, never a blank page or a spinner in empty space.

## Screens open onto their skeleton, then fill

A screen never waits to load before it moves, and never mounts heavy content
while it is still moving (that is what freezes a transition mid-slide):

- The body sits in `Handover ready={landed && loaded} skeleton={<XSkeleton />}`, where `landed = useSettledOnce()`: read from the transition's own `settled` flag (react-native-screen-transitions' `useScreenAnimation`), so content lands the moment the slide stops, not on a timer's guess. Even cached data waits for it: mounting a list during the slide (FlashList renders in several passes) is what made transitions stagger. The skeleton is on screen only while the page is moving.
- Work that runs when a screen regains focus (a reload) uses `useSettledFocusEffect`, never a bare `useFocusEffect`: focus returns at the START of the back slide, and a reload answering mid-slide re-renders a whole page there (the Library re-reading every book froze the way back from every podcast page).
- Content inside something with no transition of its own (a Library side appearing through the switch's fade) uses `useSettledAfter(ms)`.
- Tried and reverted: drawing cached content in the first frame (`immediate`). A plain scroll view drawn that way (Explore, a hundred-odd tiles) delayed the transition's start; a FlashList drawn that way landed its extra passes mid-slide. Mounting "the first screen, then the rest" by hand made the rest pop in.
- Judge transition feel on a release build: a dev build's JS thread exaggerates every mount (animate-expo; FlashList's own docs say it performs very differently in development).
- Work that parses or writes a lot on the JS thread (storing a new show parses its whole feed) waits for `landed` too, even if it starts with a network call: the parse lands mid-slide and freezes it. Latched on purpose: plain `useScreenSettled` goes false when a screen is pushed on top, and a `Handover` would then unmount the list and lose the scroll position.
- Sheets use `landed` too, and stay mounted. `useScreenSettled()` reads focus, so it re-renders the whole screen when focus returns (the start of the back slide) and re-mounted its bottom sheets about 350ms later: the freeze going back from an episode to its show. Avoid it on any screen something is pushed over.
- Queries that only feed below-the-fold parts take `enabled: landed`, so their answers do not re-render the screen mid-transition (the player).
- Skeletons are one `SkeletonGroup` (one animated node) with `SkeletonBar` shapes at the content's real sizes. Reusable pieces: `HeroCardSkeleton`, `ShowTileSkeleton`, `EpisodeRowsSkeleton`.
- Plain views that paint in the frame they mount can skip the skeleton altogether: draw the real thing from the first frame and gate only its *behaviour* on `landed` (the player's controls are drawn at once; only the scrubber's gesture waits, via `enabled`). Nothing is swapped when the screen lands, so nothing can flash, and the screen looks finished while it is still moving. Measured on the emulator: this removed the ~250ms skeleton-to-controls swap at the end of the player's open, for a slightly longer mount at the start. `Handover` is for lists, which need a frame to lay out.

## Controls answer the press, not the round trip

A control whose result comes from native (play, pause) changes on the press: set an optimistic flag in the store (`starting`, an immediate `isPlaying: false`) and let the native event confirm or clear it. Waiting for the event left Play looking unpressed through a seek.

A loader only for a wait long enough to notice (`useDelayedFlag`, 300ms): once the icon answers the press, a loader flashing on every tap is noise.

A position the app sets (a seek) is held until native confirms it (`utils/seek-hold`): polls in between otherwise draw the old value and the scrub snaps back.

Writes that re-read every list (an invalidation) do not fire on the frame an animation starts: the pause's reload lands after the artwork has finished stepping back.

## Lists that do not blank

Virtualize every list, even a short one (vercel-react-native-skills: list-performance-virtualize). Never a `ScrollView` with items mapped into it.

- A FlashList gets `drawDistance={LIST_DRAW_DISTANCE}` (about a screen).
- A horizontal shelf is `ShelfRow` (a horizontal FlashList in a `RowFade`). A page of shelves is a vertical FlashList whose rows are `ShelfRow`s: FlashList v2 has the parent wait for each nested row's layout, so rows never draw at the wrong height.
- Rows memoized, with stable props: pass the item (a genre) and a stable callback, not an inline arrow per row.
- Do not prefetch a list's artwork in bulk: FlashList starts a row's images a screen before it scrolls in, and fifty or a hundred downloads started at once only slow the ones on screen.
- A hook that returns derived objects memoizes them on their inputs (`useChart`, `useExploreSearch`): a fresh object per render defeats every memo below it and redraws the whole list.
## Size budgets

| Kind | Stop and split at |
|---|---|
| Component | ~150 lines |
| Hook | ~150 lines |
| Route file | ~120 lines |
| Service module | ~200 lines |

`src/components/ui/` is vendored PanelUI and exempt. Tests are exempt.

How to split, by what the file is doing:
- **Component with several visual chunks**: one sub-component per chunk, same folder (`PlayerProgress`, `PlayerSheets`, `MiniPlayerControls`).
- **Component with state or effects**: move them into a hook; the component keeps only JSX (`PlayerScrubber` + `useScrubber`, `PullToSync` + `usePullToSync`).
- **Hook doing several things**: one hook per concern (`useScanHold`, `usePullGesture`, composed by `usePullToSync`).
- **Service doing several things**: a folder, one module per concern, and the old path kept as the public entry that re-exports them, so callers do not change.
- **Pure logic stuck inside anything**: out to `utils/` with a test.

## Components render props

A component may call:
- `useThemeTokens`, `useCSSVariable`, `useWindowDimensions`, `useSafeAreaInsets`;
- local view state that nothing outside cares about (which page a pager is on);
- one **named** narrow selector for a per-row value, when lifting it would re-render the whole list (`useEpisodePlayback(id)`, `useDownloadProgress(id)`, `useBookProgress(id)`). Name it and put it with its store or feature hooks; never write an inline `useStore((s) => ...)` in a component.

A component may not call `useRouter`, `getState()`, `db`, or anything in
`services/` that does I/O. Types, constants and pure helpers from a
service's records module are fine (`showName`, `EXPLORE_GENRES`).

**Containers.** When calling a screen hook in the parent would re-render
something big (the whole Settings screen, the Library header), write a tiny
container whose only job is `hook() -> <View {...} />`: `BooksPage`,
`PodcastSettings`. That is the one place a component calls a screen hook.

## No logic in JSX

Allowed inline: binding an argument, `onPress={() => onOpen(book.id)}`.

Not allowed inline, derive it above the `return` or in the hook:
- choosing between actions, `onPress={x ? a : b}` with side effects in them;
- store or service calls, `() => void actions.setFavorite(...)`;
- building labels, `${n} ${n === 1 ? 'BOOK' : 'BOOKS'}` (use `countLabel`);
- branching on several flags to pick a view. Have the hook return a `view` value (`'booting' | 'setup' | 'library'`) and switch on that.

## Hooks hand over prop groups

A screen hook returns what each component needs as a group that spreads onto
it: `sheets.menu` onto `BookActionSheet`, `screen.addBooks` onto
`AddBooksSheet`, `sheets.settings` onto `ShowSettingsSheet`. The route stays a
list of components with one spread each.

- Callbacks that rows receive must be stable: `useCallback`, and read store state with `getState()` at call time rather than closing over a subscribed array (`useOpenReader`).
- A setter per field: return `bind(key)` rather than a lambda per control (`usePodcastSettings`).
- Never read `ref.current` during render. Destructure a hook's result so the ref goes straight to the element (`PagedRow`).
- `router.back` is not guaranteed to be bound; wrap it, `() => router.back()`.

## One copy of every decision

Before writing any of these, use the shared one. Adding a second copy is the
bug this codebase keeps having.

| Need | Use |
|---|---|
| Centred, capped column | `contentColumn` from `constants/theme` |
| Library shelf with VIEW ALL | `ShelfSection` (`components/shelf-section`) |
| Full-width pager with dots | `PagedRow` + `usePager` |
| Drawer screen header (close, title, count, actions) | `DrawerHeader` |
| Empty or loading list | `ListEmpty` |
| Action sheet rows | `MenuList` + a pure `*Menu()` rows function |
| Pull-to-refresh colours | `useRefreshTint()` spread onto `RefreshControl` |
| "12 BOOKS" | `countLabel` (`utils/format`) |
| Search filter | `matchesQuery` (`utils/format`) |
| Clock text, JS or worklet | `formatClock` (podcasts `utils/format`, a worklet) |
| A book's menu and its sheets | `useBookSheets` + `BookSheets` |
| An episode row renderer | `useEpisodeRowRenderer` |
| `Book` type | `import type { Book } from '@/stores/books'` |
| Colour from a CSS variable | `asColor` (`utils/colors`), never a local copy |
| Query cache, outside React | `queryClient` (`lib/query-client`) |
| A show tile from any source | `ShowTileData` + `tileFromShow` / `tileFromDiscovered` |
| A grid of shows | `ShowGrid` |
| The card heading a Library page | `HeroCard` (+ `HeroCardSkeleton`) |
| A horizontal shelf of tiles | `ShelfRow` |
| Pull to sync / refresh | `PullToSync` with `labels` and `renderIndicator` (+ `PullIndicator`) |
| Reload on coming back | `useSettledFocusEffect(fn, { skipFirst })` |
| A page body's settle latch | `useSettledOnce` (transition end), `useSettledAfter(ms)` (no transition) |
| Square artwork with a fallback (icon or serif initials) | `SquareArtwork` (`components/square-artwork`) + `monogramOf` (`utils/monogram`) |
| A followed thing's tile (show, blog) | `FeedTile` (+ `FeedTileSkeleton`); `ShowTile`/`BlogTile` only pass the icon |
| Tiles two to a row | `TileGrid` (+ `TileGridSkeleton`) |
| Hairline between list rows | `RowSeparator` |
| A row of square choice chips, with a circled "i" per chip where each has more to say | `ChoiceChips` + `Choice` (`components/choice-chips`), `onInfo` for the "i" |
| A switch between two or three kinds, in words (Lite / Enhanced, voice boxes), a padlock on one that is locked | `TextSwitch` (`components/text-switch`) |
| Content that trades places under a switch or a pair of cards, kept once drawn, with the short cross-fade | `SwitchPanes` (`components/switch-panes`) |
| What a circled "i" opens: a kicker, a title, a line, figures, points | `InfoSheet` + `InfoContent` (`components/info-sheet`) |
| Choosing a voice of any kind (phone, Enhanced, cloud): the row, the list, the samples | `VoiceListPicker` + `useVoiceListPicker` (`features/tts`); a new kind of voice is new wiring, never a second list |
| "Checking subscription", or the server never answered | `PlanCheckCard` (`features/billing/components/plan-check-card`) |
| Selling a plan anywhere | `usePlanSale` + `PlanCarousel` / `PlanPicker` / `PlansSheet` (`features/billing`); never a second checkout |
| A staged first-run or result screen | `OnboardingStage`, `StageGlyph`, `StageHeading`, `WelcomeChoice` (`components/stage/`) |
| Fetching a feed or page politely (UA, timeout, 304s) | `fetchFeed` / `fetchPage` / `normalizeFeedUrl` (`services/feeds/fetch`) |
| Feed XML reading, feed dates, OPML | `services/feeds/xml`, `parseFeedDate` (`services/feeds/dates`), `parseOpml`/`buildOpml` (`services/feeds/opml`) |
| Resolving a relative web address | `resolveUrl` / `hostOf` (`utils/urls`); never `new URL` |
| "Today", "Yesterday", "3 Jun" | `formatPubDate` (`utils/pub-date`) |
| Row ids, timestamps, chunked writes | `newId`, `nowIso`, `chunk`, `yieldToUi` (`services/rows`) |
| A blog post in the reader | `openArticleBook` (a one-chapter EPUB + a `books` row of kind `article`); book lists filter `books.kind = 'book'` |

When you find a copy: extract to the narrowest shared place, move every
caller to it, delete the copies. On the second consumer, not the first.

## Types and imports

- A domain type lives with its domain (`utils/sections.ts`, `antennapod/types.ts`), not exported from a component that happens to use it first.
- Pure utils must import nothing that pulls in React Native (icons, expo modules), so vitest can load them. Menus return keys and labels; the component maps keys to icons.
- No import cycles, type-only ones included. Check: `pnpm dlx madge@8 --circular --extensions ts,tsx --ts-config tsconfig.json <dirs>`.
- Icons only from `@/components/icons`.

## Before calling it done

```sh
export PATH="$HOME/.nvm/versions/node/v24.11.1/bin:$PATH"
# 1. Sizes
wc -l <changed files> | sort -rn | head
# 2. Components that reach for app state (each hit must be a named per-row
#    selector or a pure import; anything else moves to a hook)
grep -nE "useRouter|getState\(\)|use[A-Z][A-Za-z]*Store\(|from '@/services" src/features/*/components/*.tsx
# 3. Types, lint, tests, cycles
pnpm exec tsc --noEmit
pnpm exec eslint <changed files>
pnpm test
pnpm dlx madge@8 --circular --extensions ts,tsx --ts-config tsconfig.json <dirs>
```

Every new pure function gets a test in a `__tests__` folder beside it.
