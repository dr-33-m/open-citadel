---
name: open-citadel-design
description: How Open Citadel designs a screen or a flow - Apple's principles (apple-design) spoken in Citadel Frame's language (DESIGN.md). The staged layout for focused flows, choices as cards, instructions as steps one tap deeper, results as figures, honest progress, failures with a way out, trust lines, motion and haptics on the causal moment. Use before designing or redesigning ANY UI or UX in Open Citadel - onboarding, empty states, imports, results, errors, sheets, toasts, new features - and when a screen reads as "plain" or "a bunch of text".
---

# Open Citadel design

The owner's standard, set by the podcasts first-run and AntennaPod import
redesign (2026-09-27), which they called "beautiful" and asked to be the model
for everything after it. The reference build is
`src/features/podcasts/components/onboarding/`.

Two sources, one voice:

- **`DESIGN.md` (Citadel Frame)** is the language: square everything, gold is
  the only colour with a job, Newsreader serif for content, Manrope sans for
  chrome, spacing on 8 / 16 / 32, one ease-out curve, 24px screen gutter.
- **`apple-design`** is the thinking: purpose, agency, simplicity (not
  minimalism), feedback, wayfinding, responsibility, craft.

Apple decides *what the screen does for the person*; Citadel Frame decides
*what it looks like doing it*. Never import Apple's look (rounded corners,
blur, SF-style chrome). Import its judgement.

Load `open-citadel-structure` too for how the code is split.

## 1. Before drawing anything: what is this screen for?

Write the one sentence the screen answers ("Bring my AntennaPod library
here"). Everything on it serves that sentence or goes one tap deeper.

- **The common path is visible; the rest is one level down.** Someone who
  already has the file should reach the button without reading a word. The
  how-to lives in a sheet they open only if they need it.
- **Every screen answers: where am I, what can I do, how do I get out.** A
  failure with no way back is a bug.

## 2. The text budget

"A bunch of text" is the failure mode the owner notices first.

- **A title and ONE line under it.** A second paragraph belongs somewhere
  else: a step list, a sheet, a note at the bottom, or nowhere.
- **Instructions are numbered steps, not sentences.** Each step a square box
  with its number in the serif, then what to do. Names of things on another
  screen (menus, buttons) in `fontFamily.sansSemiBold` so they can be found.
  See `import-step.tsx` and `import-guide-sheet.tsx`.
- **Results are figures, not lines.** A count reads at a glance in the serif
  on a tile; "3,412 episodes" in a list is parsed. See `import-stat-grid.tsx`.
- **Nothing that did not happen is listed.** No zero tiles; optional figures
  only when there were some. But anything silently dropped is SAID ("2
  local-folder shows stayed behind, since their files are on the other
  device").
- Copy per DESIGN.md: plain English, buttons are verbs in uppercase labels, no
  em dashes, Samwell is "he".

## 3. The staged layout, for any focused flow

Onboarding, an import, an empty state that asks for a decision, a result, an
error: one idea per screen, drawn in the same frame.

```
┌──────────────────────────────┐
│                              │
│          ┌──────┐            │  StageGlyph: 64 square Card, hero icon 28,
│          │  ◎   │            │  gold for a brand/success moment, muted for
│          └──────┘            │  waiting or failure. Arrives first (popIn).
│                              │  32 (gap-8)
│        Serif headline        │  StageHeading: headlineLg + one bodyMd muted
│    one muted line under it   │  line, centred. revealIn(1).
│                              │  32
│   [ the content: choices,    │  revealIn(2..), staggered.
│     progress, figures ]      │
│                              │
├──────────────────────────────┤
│   [ the one gold action ]    │  Footer pinned at the bottom, where the
│   [ the way out, quieter ]   │  thumb is, not wherever the text ended.
│   a small muted note         │
└──────────────────────────────┘
```

- `OnboardingStage` owns this: a centred column capped at `contentColumn`,
  vertically centred, scrolling only when it must (small phone, large text)
  with `PageFade edges="both"`, footer pinned with `gap-4`, bottom padding
  from the caller (safe area + floating chrome + gutter).
- **Centred, never a left-aligned block floating mid-screen.** A
  `justify-center` column of left-aligned paragraphs is what "plain" looked
  like.
- **Headers never scroll** (owner rule, 2026-10-15). A screen's or a sheet's
  title, its one line, a search field or a tab switch is pinned above the
  scroll view; only the content under it moves, fading out beneath the
  header. A title scrolled away leaves a list that no longer says what it
  is. In a sheet: header as a sibling above `Sheet.ScrollView` /
  `Sheet.FlatList`, and a fixed height (`fixedHeightRatio` / `snapRatios`),
  because a content-sized sheet never hands its list the drag. See
  `components/chat/sources-sheet.tsx`.
- These pieces live in `src/components/stage/` (promoted when Blogs became
  their second consumer): `OnboardingStage`, `StageGlyph`, `StageHeading`,
  `WelcomeChoice`. The Blogs welcome (`features/blogs/components/
  blogs-welcome.tsx`) is the second example.

## 4. Choices

- **Doors are cards, not a button with a paragraph under it.** For "which
  way in" where each option leads somewhere: `WelcomeChoice`, a Card row with
  a 40 bordered `bg-muted` icon box (gold icon), a `headlineSm` name, one
  `bodySm` muted line of what it brings, and a muted chevron. Same weight for
  each when neither is wrong.
- **When the reader must weigh cases**, use the app onboarding's
  `ChoiceCard` (description, ticked points, its own button, an optional
  RECOMMENDED band). Heavier, so only when the comparison is the point.
- A door that needs preparation opens a **sheet with the steps and the gold
  action**, not the system picker cold.

## 5. States of work

Every flow that does work draws all four: before, during, done, failed.

- **During:** the progress bar is the one gold thing, because it is what is
  being waited on. A count in `labelSm` ("12 OF 48 SHOWS"), the item in
  hand keyed so each fades in (`FadeIn`, `motion.fast`) instead of
  flickering, and an honest footer about what the person must do ("Keep Open
  Citadel open until this finishes").
- **Done:** gold success glyph, a human headline ("Welcome back"), the
  figures, one note of what is still worth knowing, the one way on as the
  gold button.
- **Failed:** muted alert glyph, what went wrong in plain words, the retry as
  the gold button, and a quieter way out (NOT NOW). Never a dead end.
- **A failure inside a form or a sheet is a toast, never red text under the
  field** (owner rule, 2026-10-13: "they are ugly"). `showToast` with a `key`;
  keep what was typed so it can be mended. See
  `features/billing/hooks/use-insider-code.ts`.
- **Work started from a menu or elsewhere with no screen of its own** reports
  in a toast with a live accessory (the download toast: progress square with
  a stop in its centre, then "Downloaded X" with a tick). Toasts stack from
  the front card's bottom and spread into a column on a tap.
- **Loading:** skeleton first, open at once, mount heavy content after the
  transition settles; a loader only for a real delay (see memory
  feedback_skeleton_first).

## 6. Responsibility and trust

Say concretely what happens to the person's data, where they decide: "The
file is read on this phone. Nothing is uploaded." with a muted `Lock`. Ask
only for what is needed, at the moment it is needed.

## 7. Colour and icons

- Gold on the screen's one commit (GoldButton), progress, and button icons.
  **Button icons are gold, never ink/black** (owner rule). Status marks,
  chevrons and waiting glyphs are muted.
- Surfaces from the ladder (`Card` for a card, never hand-rolled bg-card +
  shadow). Hairline borders. Square corners, no exceptions.

## 8. Motion and haptics

- Entrances: glyph `popIn(motion.base)` first, then `revealIn(n)` down the
  column (40ms steps, capped at six). A phase change remounts the stage, so
  its entrance replays and the new state composes itself in.
- Declarative motion on the house curve, no springs. Anything a finger
  drives keeps its physics (toasts, sheets, pulls).
- Reduced motion is handled by `popIn`/`revealIn`/`FadeIn` (ReduceMotion
  System); do not add motion that bypasses it.
- Haptics on the causal frame only: `select` on choosing a door, `commit`
  when the work lands, `warn` when it fails. No haptic on a toast appearing.

## 9. Where the decisions live

- Wording and figures that depend on data are a **pure util with tests**
  (`features/podcasts/utils/import-summary.ts`: `importStats`,
  `importOutcome`, `importProgressLabel`, `formatCount`). Components render
  what it returns.
- Sheet visibility and "open the guide, then the picker" live in the hook
  (`use-antennapod-import.ts` returns `openGuide` and `guide` to spread onto
  the sheet). Components stay presentational.

## Checklist before calling a screen done

- [ ] One sentence says what the screen is for; nothing on it is off-topic.
- [ ] Title plus one line; instructions are steps; results are figures.
- [ ] Centred column, actions pinned at the bottom, scroll fade if it scrolls.
- [ ] Headers pinned: title, line, search and tabs stay put; only content scrolls.
- [ ] One gold commit; button icons gold; status marks muted; no black icons.
- [ ] Before / during / done / failed all drawn; failure has a way out.
- [ ] Anything skipped is said; any data handling is stated plainly.
- [ ] Glyph pops in, the rest reveals in order; haptic on the causal frame.
- [ ] Copy: plain, verbs, uppercase labels, no em dashes.
- [ ] Data-dependent wording is a tested pure util.
