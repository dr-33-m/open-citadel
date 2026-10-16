# Open Citadel — working guidelines

Read this before writing code. It is the house style, not a suggestion.

## Where things go

```
src/
  app/          Expo Router routes. A route file wires things together and
                owns nothing. If it has logic worth a name, that logic lives
                somewhere below and the route calls it.
  features/     Feature-owned code, the default home for new work.
    <feature>/
      components/   Presentational pieces for this feature.
      hooks/        Stateful logic for this feature.
      utils/        Pure functions for this feature.
  components/   Cross-feature UI.
    ui/         VENDORED PanelUI source — see the warning below.
  hooks/        Hooks used by more than one feature.
  lib/          Cross-cutting infrastructure (cn, native wrappers, setup).
  utils/        Pure, dependency-free helpers (colors, dates, formatting).
  services/     I/O and domain work: inference, database, network, parsing.
  stores/       Zustand stores. Client state and the actions that change it.
  query-manager/ TanStack Query keys and query options, a folder per domain
                (keys.ts, options.ts, index.ts). Queries and mutations
                themselves live in feature hooks.
  navigation/   Routing helpers and transitions.
  constants/    Theme, typography, spacing, motion.
```

Put a thing in the narrowest place that fits. Something used by one feature
belongs to that feature; promote it to the shared folders on the *second*
consumer, not in anticipation of one.

## Designing a screen

**Load the `open-citadel-design` skill before designing or redesigning any
UI or UX**: a screen, a flow, an empty state, a sheet, a toast. It is Apple's
judgement (`apple-design`) spoken in Citadel Frame's language (`DESIGN.md`):
a title and one line rather than paragraphs, instructions as steps one tap
deeper, choices as cards, results as figures, actions pinned at the bottom,
every state of work drawn, and a way out of every failure. The podcasts
first-run and import (`src/features/podcasts/components/onboarding/`) is the
reference build.

**A failure is said in a toast, never in red text on the screen.** A code that
was refused, a save that did not land, a feed that could not be found:
`showToast` from `components/toast/toast-provider`, with a `key` so a second
failure writes over the first. A red line under a field pushes the layout
about and stays after it has stopped being true. What was typed is kept, so
it can be mended. The insider code sheet
(`src/features/billing/hooks/use-insider-code.ts`) is the reference.

## Components are presentational and small

The `open-citadel-structure` skill has the working detail: the four layers
(route, screen hook, component, pure util), size budgets per kind of file,
how to split each, and the table of shared pieces to use instead of writing
a second copy. Load it before writing or refactoring a screen.

- **A component renders props.** Reaching into a store, a router or the
  database from inside one is what makes it impossible to reuse and
  impossible to look at in isolation. Take data and callbacks as props; let
  the route or a hook do the wiring.
- **Roughly 150 lines is the point to stop and split**, for hooks as well as
  components (routes ~120, services ~200). Not a hard limit, but past it you
  are almost always looking at two components, or one component and a hook.
  Extract the sub-piece into its own file in the same folder. A service that
  outgrows its budget becomes a folder, with the old path kept as its entry.
- **One component per file**, named after the file. A small private helper
  used only by that component may share the file; anything a second file
  wants gets its own.
- **Every scrollable gets a scroll fade**, except a carousel. `PageFade` for a
  vertical page or sheet, `RowFade` for a horizontal shelf, both from
  `components/scroll-fades`. The scrollbars are all hidden, so the fade is the
  only thing saying content continues; pass the right `surface` or it draws a
  band of the wrong shade instead of a fade.
- **Headers never scroll.** A screen's or a sheet's title, the line under it,
  a search field or a tab switch sits outside the scroll view, and only the
  content under it moves. A title scrolled away leaves a list that no longer
  says what it is. In a sheet that means the header is a sibling *above*
  `Sheet.ScrollView` / `Sheet.FlatList`, and the sheet has a fixed height
  (`fixedHeightRatio` or `snapRatios`): one sized to its content
  (`maxHeightRatio`) stops at its cap but never hands the list inside it the
  drag. `SourcesSheet` and `UpNextSheet` are the reference.
- **No logic in JSX.** Derive above the `return`, or in a hook, or in a pure
  function in `utils/`.

## DRY, and what it actually means here

Two copies of a rule are two chances to get it wrong, and in this codebase
they have already drifted more than once — the two chat surfaces each grew
their own model-readiness checks and their own activity indicator, and the
copies disagreed. When you find yourself writing something that already
exists elsewhere:

1. Extract it to the narrowest shared place (see the map above).
2. Make both call sites use it.
3. Delete the copies. Leaving one behind is the whole problem.

Duplication of *shape* is fine; duplication of *decisions* is not. Two lists
that happen to look similar can stay separate. Two places deciding what
"Samwell is ready" means cannot.

**One component for one kind of thing.** Before building a picker, a sheet, a
switch, a list or a card, look for the one the app already has and use it:
the table of shared pieces is in the `open-citadel-structure` skill, and
`grep` finds the rest. Everything that can use the same component must. If
the existing one does not quite fit, give it a prop; do not write a second
one beside it. A new kind of the same thing is new *wiring* (what it loads,
what a choice saves), never new *drawing*. The reading voices are the model:
the phone's voices, the Enhanced ones and every cloud voice box are three
thin pickers over one `VoiceListPicker`, one `VoiceListSheet` and one
`useVoiceListPicker`, so a fix to the list (it used to stutter when dragged
shut just after opening) lands in all of them at once. When you find two
components drawing the same thing, that is a bug to fix in the same change,
not a note for later.

## Performance is designed in, not profiled out

**Consult `vercel-react-native-skills` and `expo-react-native-performance`
before writing feature code**, plus `animate-expo` for anything that moves.
Not as a review pass afterwards. Rules that have already bitten this project:

- **Subscribe narrowly.** `useStore((s) => s.field)`, never `useStore()`. The
  whole-store form re-renders a chat screen on every streamed token.
- **Animate one node for a group**, not one per element. Twenty-one
  independently animated skeleton bars cost 950ms on a Galaxy A33.
- **Never mount expensive content while something is still animating.** Gate
  on a settle signal: `useScreenSettled` for screens, the `Sheet` settled
  context for sheets, `Handover`'s `ready` prop for either.
- **Reanimated, not core `Animated`.** Transform and opacity only.
- **Icons come from `@/components/icons`**, never from `lucide-react-native`.
  Metro does not tree-shake, so the package barrel put 1,749 icon modules in
  the bundle for the 70 we draw: a third of every module in the app, 3.2MB of
  bytecode, and ten times the icon evaluation cost on a Galaxy A33. Add a deep
  import to that module instead. The same trap waits in any package that
  re-exports a large set from its root.
- **Verify on device by measurement**, not by eye and not in the simulator.

## Vendored UI — do not restructure

`src/components/ui/` is PanelUI copied in as source, managed by
`panelui-lock.json`. Those files are large because upstream wrote them that
way, and the size guidance above does not apply to them. Add components with
`pnpm dlx panelui-cli@latest add <name>`; the CLI writes to `components/ui/`
at the repo root, so **move the file into `src/components/ui/` and fix the
lock entry's path prefix** afterwards. Edit vendored files only with a
comment saying why, since an update will overwrite it.

## Copy

Plain, simple English. **No em dashes in user-facing copy** (they are fine in
code comments, which is how the rest of the codebase reads). Samwell is a
person: "he", never "it".

## Tooling

- **pnpm**, never npm or npx.
- Build: `eas build --local --platform android --profile development`.
- Check work with `pnpm exec tsc --noEmit` and `pnpm exec eslint <paths>`.
- Publish an over-the-air update with `scripts/publish-update.sh`, never a
  bare `eas update`. Write `release-notes.json` first: it is what the update
  dialog shows, two or three words a note, most important first (the first
  four are drawn, the rest sit behind "+ N more"). Notes are written for
  readers, by hand; commit titles stay written for developers.
