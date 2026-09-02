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
  stores/       Zustand stores. State and the actions that change it.
  navigation/   Routing helpers and transitions.
  constants/    Theme, typography, spacing, motion.
```

Put a thing in the narrowest place that fits. Something used by one feature
belongs to that feature; promote it to the shared folders on the *second*
consumer, not in anticipation of one.

## Components are presentational and small

- **A component renders props.** Reaching into a store, a router or the
  database from inside one is what makes it impossible to reuse and
  impossible to look at in isolation. Take data and callbacks as props; let
  the route or a hook do the wiring.
- **Roughly 150 lines is the point to stop and split.** Not a hard limit, but
  past it you are almost always looking at two components, or one component
  and a hook. Extract the sub-piece into its own file in the same folder.
- **One component per file**, named after the file. A small private helper
  used only by that component may share the file; anything a second file
  wants gets its own.
- **Every scrollable gets a scroll fade**, except a carousel. `PageFade` for a
  vertical page or sheet, `RowFade` for a horizontal shelf, both from
  `components/scroll-fades`. The scrollbars are all hidden, so the fade is the
  only thing saying content continues; pass the right `surface` or it draws a
  band of the wrong shade instead of a fade.
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
