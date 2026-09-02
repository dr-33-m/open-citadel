---
name: Citadel Frame
description: >-
  The design system for Open Citadel, a personal knowledge companion for
  serious readers. Square geometry, gold on obsidian, hierarchy from light
  and spacing rather than decoration.
platform: react-native
defaultMode: dark

# ── Colour ───────────────────────────────────────────────────────────
# `colors` is the default (dark) mode. Both modes are under `modes`.
# Every value is a static hex or rgba: React Native cannot evaluate
# color-mix() at runtime, so derived tints are precomputed.
colors:
  background: "#131313"
  foreground: "#d0c5af"
  card: "#1c1b1b"
  card-foreground: "#d0c5af"
  popover: "#212121"
  popover-foreground: "#d0c5af"
  overlay: "#252525"
  overlay-foreground: "#d0c5af"
  inset: "rgba(0, 0, 0, 0.22)"
  scrim: "rgba(19, 19, 19, 0.45)"
  primary: "#f2ca50"
  primary-foreground: "#131313"
  primary-deep: "#d4af37"
  secondary: "#252525"
  secondary-foreground: "#d0c5af"
  muted: "#252525"
  muted-foreground: "#8a8378"
  accent: "#252525"
  accent-foreground: "#d0c5af"
  destructive: "#F2564F"
  destructive-foreground: "#FFFFFF"
  info: "#8FB3CC"
  success: "#7FB88F"
  warning: "#E0A44A"
  border: "rgba(208, 197, 175, 0.15)"
  input: "rgba(208, 197, 175, 0.15)"
  ring: "#f2ca50"
  surface: "#252525"
  surface-secondary: "#252525"
  surface-tertiary: "#353534"
  skeleton: "rgba(208, 197, 175, 0.1)"
  chart-1: "#f2ca50"
  chart-2: "#b8892c"
  chart-3: "#d0c5af"
  chart-4: "#8a8378"
  chart-5: "#6b655c"

modes:
  dark:
    label: Obsidian & Gold
    background: "#131313"
    foreground: "#d0c5af"
    card: "#1c1b1b"
    popover: "#212121"
    overlay: "#252525"
    inset: "rgba(0, 0, 0, 0.22)"
    scrim: "rgba(19, 19, 19, 0.45)"
    primary: "#f2ca50"
    primary-deep: "#d4af37"
    primary-foreground: "#131313"
    muted-foreground: "#8a8378"
    destructive: "#F2564F"
    info: "#8FB3CC"
    success: "#7FB88F"
    warning: "#E0A44A"
    border: "rgba(208, 197, 175, 0.15)"
    surface-tertiary: "#353534"
    skeleton: "rgba(208, 197, 175, 0.1)"
    status-soft-alpha: 0.06
    status-subtle-alpha: 0.16
    chart: ["#f2ca50", "#b8892c", "#d0c5af", "#8a8378", "#6b655c"]
    chart-track: "#252525"
  light:
    label: Parchment & Gold
    background: "#F5EEE0"
    foreground: "#1C1510"
    card: "#FDFAF4"
    popover: "#FDFAF4"
    overlay: "#EDE5D4"
    inset: "rgba(0, 0, 0, 0.05)"
    scrim: "rgba(0, 0, 0, 0.45)"
    primary: "#B8861A"
    primary-deep: "#9A7015"
    primary-foreground: "#F5EEE0"
    muted-foreground: "#6B6050"
    destructive: "#E53935"
    info: "#5B7C99"
    success: "#4A7C59"
    warning: "#C17817"
    border: "rgba(28, 21, 16, 0.20)"
    surface-tertiary: "#C4B89A"
    skeleton: "rgba(28, 21, 16, 0.08)"
    status-soft-alpha: 0.10
    status-subtle-alpha: 0.08
    chart: ["#B8861A", "#7A5A10", "#6B6050", "#9A8B6E", "#3E3830"]
    chart-track: "#EDE5D4"

# ── Typography ───────────────────────────────────────────────────────
fonts:
  serif: Newsreader     # display, headlines, book titles, quoted text
  sans: Manrope         # body, labels, UI chrome
  mono: Menlo (iOS) / monospace (Android)

typography:
  display-lg:
    fontFamily: Newsreader
    fontWeight: 700
    fontSize: 48px
    lineHeight: 56px
  display-md:
    fontFamily: Newsreader
    fontWeight: 700
    fontSize: 36px
    lineHeight: 44px
  headline-lg:
    fontFamily: Newsreader
    fontWeight: 500
    fontSize: 28px
    lineHeight: 36px
  headline-md:
    fontFamily: Newsreader
    fontWeight: 500
    fontSize: 22px
    lineHeight: 28px
  headline-sm:
    fontFamily: Newsreader
    fontWeight: 500
    fontSize: 18px
    lineHeight: 24px
  body-lg:
    fontFamily: Manrope
    fontWeight: 400
    fontSize: 18px
    lineHeight: 28px
  body-md:
    fontFamily: Manrope
    fontWeight: 400
    fontSize: 16px
    lineHeight: 24px
  body-sm:
    fontFamily: Manrope
    fontWeight: 400
    fontSize: 14px
    lineHeight: 20px
  label-lg:
    fontFamily: Manrope
    fontWeight: 600
    fontSize: 14px
    lineHeight: 20px
    letterSpacing: 1.4px
    textTransform: uppercase
  label-md:
    fontFamily: Manrope
    fontWeight: 600
    fontSize: 12px
    lineHeight: 16px
    letterSpacing: 1.2px
    textTransform: uppercase
  label-sm:
    fontFamily: Manrope
    fontWeight: 600
    fontSize: 11px
    lineHeight: 16px
    letterSpacing: 1.1px
    textTransform: uppercase

# ── Shape ────────────────────────────────────────────────────────────
# Every step is 0. Square edges are the house signature.
rounded:
  xs: 0px
  sm: 0px
  md: 0px
  lg: 0px
  xl: 0px
  2xl: 0px
  3xl: 0px

# ── Spacing ──────────────────────────────────────────────────────────
spacing:
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  5: 20px
  6: 24px
  8: 32px
  10: 40px
  12: 48px
  16: 64px
  20: 80px

layout:
  gutter: 24px            # every screen's content and headers (px-6)
  gutter-compact: 16px    # row-as-target surfaces: sheets, message lists (px-4)
  card-padding: 16px      # inside a card (p-4)
  section-gap: 32px       # between unrelated sections (gap-8)
  block-gap: 16px         # header to body, peers inside a section (gap-4)
  item-gap: 8px           # parts of one thing: icon and label (gap-2)
  screen-top: 24px        # header down to first section (pt-6)
  scroll-bottom: 32px     # trailing clearance under floating chrome
  sheet-top: 20px         # sheet chrome down to first row
  max-content-width: 800px

# ── Depth ────────────────────────────────────────────────────────────
# Depth comes from light, not blur. Two shadows, no more.
elevation:
  soft: "0 2px 10px rgba(0, 0, 0, 0.16)"   # repeated items: covers, timeline cards
  card: "0 4px 18px rgba(0, 0, 0, 0.20)"   # the hero surface, floating nav, FAB

# ── Motion ───────────────────────────────────────────────────────────
motion:
  fast: 120ms     # press feedback, state flips, pulse loops
  base: 180ms     # row and bubble entrances, list reflow
  slow: 250ms     # content reveals, cross-fades, deferred screen bodies
  stagger: 40ms   # step between members of a group entrance
  easing: cubic-out
  easing-css: ease-out
  spring: false

# ── Iconography ──────────────────────────────────────────────────────
icons:
  set: lucide-react-native
  style: stroke only, never filled
  strokeWidth: 2
  size-default: 22px
  size-nav: 24px
  size-hero: 28px

# ── Data surfaces ────────────────────────────────────────────────────
charts:
  ramp: warm monochrome, gold to ash. Hue is never the variable.
  max-series: 3
  stroke-linecap: butt        # square ends, never round
  ring-thickness: 10px
  ring-gap: 4px
  ring-track: muted
  grid-color: border
  axis-label: label-sm
---

# Citadel Frame

## Overview

Open Citadel is a personal knowledge companion for serious readers: a
library, an EPUB reader, a timeline of everything you captured, and Samwell,
an on-device reading companion. It is a tool people use for an hour at a
time, at night, holding a book. The interface has to be quiet enough to read
inside of and confident enough to be worth opening.

Three ideas hold the whole system together:

1. **Square, always.** Every corner in the app is 0px. This is the one place
   Citadel Frame goes harder than the framework it sits on, and it is the
   fastest way to tell whether a screen belongs to this app.
2. **Hierarchy from light and spacing, not decoration.** No dividers where a
   gap will do, no badges where weight will do, no colour where contrast
   will do.
3. **Gold is the only colour with a job.** Everything else is ink,
   parchment, or obsidian. When gold appears, it means *this is the thing*.

The app is dark by default. Light mode is a real, first-class parchment
theme, not an inversion.

## Colours

The palette is two named modes of one family. Never introduce a colour that
is not a token, and never hardcode a hex in a component.

### Obsidian & Gold (dark, default)

- **Background** `#131313` — the page. Most of the screen.
- **Card** `#1c1b1b` — content surfaces sitting on the page.
- **Popover** `#212121` — sheets, dialogs, selects, toasts. One rung above a
  card so a sheet reads as forward without the page having to darken.
- **Overlay** `#252525` — menus, the layer furthest forward.
- **Foreground** `#d0c5af` — warm bone, not white. Reading at night for an
  hour is the use case; pure white is a lamp pointed at the face.
- **Muted foreground** `#8a8378` — secondary text, timestamps, counts.
- **Primary** `#f2ca50` — gold. **Primary deep** `#d4af37` is the second
  stop of every gold gradient.
- **Border** `rgba(208, 197, 175, 0.15)` — a hairline of the foreground, not
  a grey.

### Parchment & Gold (light)

- **Background** `#F5EEE0`, **card** `#FDFAF4`, **foreground** `#1C1510`.
- **Primary** `#B8861A` — gold has to darken in light mode to stay legible
  against parchment. It is the same colour doing the same job, not a
  different accent.

### How to use them

- **Primary/gold**: the single most important action on a screen, section
  eyebrow labels, active navigation, progress. If two things on one screen
  are gold, one of them is wrong.
- **Gold gradients** run `primary → primary-deep` on a diagonal
  (`{x:0,y:0}` to `{x:1,y:1}`). This is reserved for the FAB and the primary
  commit button. It is the app's most emphatic surface, so it appears once
  per screen at most.
- **Surface ladder**: `background → card → popover → overlay`. Each step is
  one notch further from the page. Nesting surfaces is how depth is
  expressed; do not skip rungs to get more contrast.
- **Inset** is a band set *into* a surface (a card's action footer), not
  raised off it. It is a translucent black in both modes because it has to
  come out darker than whatever it is drawn on. Never use `muted` for this:
  muted is lighter than the card in dark mode, so it floats forward, which
  is the opposite of what a footer says.
- **Scrim** is the dim behind an overlay. In dark mode it is the background
  colour at 45%, not black — the page flattens toward its own base instead
  of past it, so opening a sheet does not visibly re-shade the whole screen.
- **Status colours** (`info`, `success`, `warning`, `destructive`) each have
  a `-soft` fill (alerts) and a `-subtle` fill (badges) as precomputed
  tokens. Use the token, never `bg-info/10`.

**Red and green are reserved, and most numbers get neither.** They were being
spent on ordinary figures — a goal three weeks into four months at 14% of its
money read as an emergency when it is simply early — and a colour that shouts on
an ordinary day has nothing left for a real one. So the palette's own colours
carry the everyday case, and the two loud ones mean exactly two things:

- **Green**: at or past 80% *and* not behind the clock. This is on course to
  land, and it is what a finished goal should be wearing.
- **Red**: materially behind the pace the calendar implies (more than 15 points
  under elapsed time). Not "a low number" — a number that is low *for how late
  it is*.
- **Everything else takes a theme colour.** Gold for the headline figure, bone
  (`--color-chart-3`) for a second one beside it, so two neutral things stay
  tellable apart.

A ratio that already measures against what was due to date — a consistency
score — carries its own pace, so it is judged on its own thresholds rather than
compared to the calendar a second time. `paceTone` and `toneColor` in
`components/compass/format.ts` are the whole rule.

## Typography

Two families, and the split is meaningful.

- **Newsreader (serif)** is for anything that is *content* or names content:
  display numbers, screen titles, book titles, headlines, quoted passages.
  It is the voice of the library.
- **Manrope (sans)** is for anything that is *interface*: body copy,
  buttons, labels, metadata, chrome.

Never use the serif for a control, and never use the sans for a book title.

Labels are uppercase with wide tracking (1.1–1.4px) and are almost always
gold or muted. They are eyebrows above a section, never a sentence.

Body copy is 16/24. Long-form reading surfaces step up to 18/28.

## Shape

There are no rounded corners. Not on buttons, cards, sheets, avatars,
inputs, chips, or images. The radius scale exists so vendored components
resolve to something, and every step resolves to 0.

**There is no exception, including for calendar day marks.** This document
previously carved one out for the selected day, the today ring and the activity
dot, following a note in `calendar-picker.tsx`. It has been removed, for a
reason worth recording so nobody re-adds it:

On RN 0.86 / Fabric / Android a view with a **background colour ignores
`borderRadius`**, while an identically-radiused **stroked** view honours it. So
the today ring drew as a circle and the selected fill drew as a square from the
same line of code. `rounded-full` (which resolves against a radius scale that is
0 everywhere here), an explicit large radius, exactly-half-the-box, and a fill
carrying a matching ring were all tried; the filled mark stayed square through
every one of them. Two shapes that disagree is worse than either shape, and
square is what the rest of the app already is.

> **Note:** `src/components/timeline/calendar-picker.tsx` still asks for
> `rounded-full` on its selected/today marks and carries a comment calling it a
> deliberate exception. It is subject to the same rendering behaviour, so its
> selected day is already square in practice. Sweep it to match.

Borders are hairlines at **20% of the foreground in light, 15% in dark**, and
the asymmetry is deliberate rather than an oversight. A hairline is only seen
against the surface it encloses, and the distance it has to travel is not the
same in the two themes: dark's border sits about 12 L\* above a card at L\* 10,
where that is a doubling, while light's sits below a card at L\* 98, where the
same step is a rounding error. Matched on paper at 12% the light theme had no
visible card edges at all — pale rectangles on a pale ground, held together by
a shadow a light theme barely shows either. Match the *perceived* step, not the
number.

A border is used when two surfaces are the same colour and still need
separating; when they differ in the surface ladder, the ladder already did the
job and the border is noise.

## Depth

**A card is `components/ui/card`.** The vendored `Card` is the house card
everywhere: it draws `bg-card`, a hairline border and PanelUI's own `shadow-sm`,
and because `--radius-*` is 0 in this theme its `rounded-2xl` resolves square
with no override needed. Do not hand-roll a surface out of `bg-card` plus a
shadow constant — that is how two cards end up disagreeing about their weight.

The two hand-rolled shadows in `constants/theme.ts` are heavier than the card
they sit under and read as a soft glow rather than a lift, which is most obvious
in dark mode where the blur reads as a rounded edge on a square box:

- `elevation.card` and `elevation.soft` are **deprecated for cards.** They
  survive only for things that are not cards and genuinely float — the FAB and
  the floating composer.

There is still no third level. If something needs more separation than the card
gives it, it moves up the surface ladder, it does not gain a shadow.

> **Outstanding:** Compass has moved to the house `Card`. The rest of the app —
> `book-grid-card`, `timeline-entry`, the chat cards, the settings sections —
> still builds its own surface with `elevation.*` and should be swept onto
> `Card` too.

## Layout

Horizontal position is the gutter, and there is one gutter per surface kind:
**24px for screens**, **16px for surfaces whose rows are the interactive
target** (sheets, message lists, transcripts). Everything at the same depth
lines up on the same vertical, so a screen reads as one column.

Vertical distance encodes relationship, on a ladder of **8 / 16 / 32** — one
doubling apart, legible without measuring:

- **8px** between the parts of one thing (icon and label, title and
  subtitle).
- **16px** between a section's header and its body, and between peers.
- **32px** between two unrelated sections.

Nothing gets a gap that is not on this ladder.

Content is capped at **800px** and centred, so a phone never sees the cap
and a tablet never gets a 900px line of text.

Screens with a FAB or a floating bar pay their own bottom clearance so the
last row can always be scrolled clear of the chrome.

## Motion

Slow and elegant, no spring physics. Every animation in the app uses one
curve: **ease-out cubic**, decelerating into rest, never overshooting.

- **120ms** — press feedback, toggles, pulse loops.
- **180ms** — row and bubble entrances, list reflow.
- **250ms** — content reveals, cross-fades, a screen body arriving after its
  transition settles.
- **40ms** — the step between members of a staggered group, capped at six
  steps. Past that the delay stops being rhythm and becomes a queue.

Two house entrances:

- **`popIn` / `popOut`** for something small appearing in place — an icon
  swapping, a control arriving on a built screen. It starts at 92% scale,
  not 0: nothing in the physical world appears out of nothing, and something
  that does reads as conjured rather than as arriving. The exit is quicker
  than the entrance, because leaving is the system responding and arriving
  is the user deciding.
- **`revealIn`** for a section arriving as part of a screen filling in: it
  rises 10px and fades, a beat behind the one above it.

**Gesture-tracked motion keeps its physics; declarative motion keeps the house
curve.** The two rules above govern everything the app decides on its own —
entrances, cross-fades, press feedback, state flips. They do not govern
something a finger is holding. A sheet being dragged and a card being swiped
off the deck have to track the finger 1:1, inherit the release velocity, and
be grabbable mid-flight; that is what `@gorhom/bottom-sheet` and the
Carousel's own springs already do, and replacing it with a fixed 180ms curve
would make the app feel dead in exactly the places it is most physical. The
distinction is not spring versus timing, it is *who is driving*: if the user's
thumb is, the motion answers to the thumb.

**Skeletons are close to banned.** A skeleton is a drawing of content that
has not arrived, and it earns its ugliness only when the wait is real and
long. This app's data is local, so the content is one render away, and a
grey outline of it is a picture of a problem the app does not have. Reveal
the real sections in sequence instead: it fills the same moment with the
thing the user came for, and reads as the screen composing itself.

Press feedback is a UI-thread scale plus **0.6 opacity** — the house dim the
whole app reads as "pressed".

Everything honours the system reduce-motion setting. Under it, movement and
stagger both drop and the screen simply appears.

## Scrolling

**Every scrollable carries fades at its edges. Carousels do not.**

The app hides every scrollbar, so a fade is the only thing telling the reader
that content continues past the boundary. Without one a list that is cut off
looks like a list that has ended, which is the difference between a screen that
is missing something and a screen that is finished.

- A vertical page, transcript or sheet: `PageFade`. `edges="start"` for content
  running under a header, `edges="both"` when it also runs under floating
  chrome.
- A horizontal shelf or row of cards: `RowFade`, which fades both ends because a
  row can be scrolled from either.
- Both take `surface`, and it matters: a gradient resolving to the wrong ground
  does not disappear, it draws a visible band of the wrong shade along the edge,
  which is worse than no fade. Sheets are `popover`, everything else is
  `background`.

**A carousel is exempt**, and that is not an oversight. It shows one thing at a
time with its neighbours deliberately in view, so there is no hidden content for
a fade to hint at, and fading its edges would dim the very peek that says which
way to swipe.

Depth lives in `components/scroll-fades.tsx` and nowhere else. Change a number
there and every shelf and page moves together.

## Iconography

Lucide, stroke only, never filled, stroke width 2. Sizes are **22 default /
24 navigation / 28 hero**. An icon inherits its colour from the surface it
sits on rather than carrying a hex, so it follows a theme flip for free.

Icon-only buttons are a **40dp bordered box** with 8px of hit slop, which
takes the real target past the 44dp minimum while keeping the drawn box at
the size the design wants. The same 40dp box appears on every screen header,
so the headers read as one bar that changes contents rather than as three
different headers.

## Haptics

Haptics are named intents, and they are reserved for moments that commit or
change something. Not every tap.

- **select** — moving a selection: switching tabs, crossing a boundary.
- **tap** — light and incidental: toggling a chip, paging a carousel.
- **commit** — approving a draft, saving, sending.
- **warn** — destructive or terminal: delete, reject.

A long press always thumps on threshold, because a hold has no visual
feedback until the menu appears, so the haptic *is* the confirmation.

## Components

- **Buttons** — square, six variants (primary, secondary, outline, ghost,
  destructive, social) and five sizes (36/44/48/56dp plus a square icon
  box). Minimum heights, not fixed heights, so a label that scales under
  Dynamic Type can grow its box.
- **GoldButton** — the diagonal gold gradient, 56dp tall, uppercase
  `label-lg`. The one commit action on a screen.
- **FAB** — 52dp square, gold gradient, `card` elevation, 40px from the
  bottom and 24px from the right. The screen's single creative action: a new
  thought, a new book.
- **Card** — a surface with all padding on its slots and none on the root,
  so a card whose cover reaches its own edges needs nothing but clipping. Its
  footer is either `plain` (more of the card's body) or `panel` (a rule, a
  step darker, set into the card — the card's *actions*).
- **Frame** — a widget shell: a card of rows nested in a tray, with the
  tray's one exposed top strip carrying the title. That exposed strip is why
  the header needs no rule under it.
- **Sheets** — open on `popover`, own their own top padding and safe-area
  bottom padding. Call sites add neither. **No autofocus**: the keyboard
  opens on an explicit tap, never on sheet open.
- **Section headers** — an optional gold uppercase eyebrow above a serif
  title, with an optional trailing action or count.
- **Empty states** — say what would be here and how to put something here.
  Never a shrug.

## Data surfaces: Planner, RingChart, Timeline

These three come from PanelUI and are new to the app, so their brand rules
are set here before a screen is generated rather than discovered afterwards.

### The chart ramp

`chart-1` … `chart-5` are **a warm monochrome ramp, gold to ash. Hue is
never the variable.** PanelUI ships blue, green, amber and purple, and four
unrelated hues would break the one rule the whole palette rests on: gold is
the only colour with a job. Series separate by *weight and chroma* instead —
gold, bronze, bone, ash, dim — which is also the order of prominence, so
`chart-1` is always the series the chart is about.

| | Obsidian (dark) | Parchment (light) |
| --- | --- | --- |
| `chart-1` | `#f2ca50` gold | `#B8861A` gold |
| `chart-2` | `#b8892c` bronze | `#7A5A10` deep bronze |
| `chart-3` | `#d0c5af` bone | `#6B6050` ash |
| `chart-4` | `#8a8378` ash | `#9A8B6E` dun |
| `chart-5` | `#6b655c` dim | `#3E3830` deep ink |

Every value clears 3:1 against `card`, which is the surface a chart sits on.

**Three series is the cap on a phone.** If a chart needs five, it is two
charts, or it is a list.

### Status is not the ramp

The ramp answers "which series is this". It never answers "is this good".
Anything that is a **judgement** uses the pace tones instead (see Colours):
theme colours by default, green only when on course, red only when materially
behind the clock. So:

- A ring showing **progress toward a target** is a judgement: score colours.
- A ring **distinguishing categories** against each other is not: ramp.

A single chart never mixes the two.

### RingChart

Concentric arcs, each measured against its own target.

- **Butt caps, never round.** This is the one place a chart library's default
  visibly contradicts the house: rounded arc ends are the norm everywhere and
  square edges are the signature here. Set `strokeLinecap` explicitly.
- **10px arc, 4px gap** between rings.
- The unfilled portion of an arc is the **track**. `RingChart` draws it as its
  own arc colour at 15% and exposes no track colour, so this is the arc's hue
  gone quiet rather than a neutral. Left as it is: at that opacity it reads as
  the unfilled part of the same ring, which is what it is.
- **Three rings maximum.** Rings separate by radius, not by colour, so a
  fourth is a radius nobody can compare against the first.
- The centre carries the number in **serif `display-md`** with its unit in
  **uppercase `label-sm` muted** underneath. Serif because the number is
  content, not chrome.
- It animates on the app's terms: **250ms, ease-out**, arcs sweeping from
  zero once, on the settle signal after the screen transition. Not a spring,
  and not on every re-render.

### The log deck

A `Carousel` in `variant="stack"`: the active card on top, the next two peeking
out behind it, dealt one at a time.

- The pile behind the top card is the point. It says how much is left without a
  progress bar, and it is why the cards are sized (300pt) rather than
  full-width — a card as wide as the screen has nothing to stack behind it.
- **Three outcomes in one row of icons**, weighted by how often each is the
  right answer: a wide gold tick in the middle for done, a cross on the left
  for didn't happen, a clock on the right for later. Most days the answer is
  the middle one, so it is the one the thumb reaches without aiming, and the
  two that carry a cost are smaller and off to the sides. Each keeps a real
  accessibility label — a row of three unlabelled glyphs says nothing to a
  screen reader.
- **Anything deferred stays reachable.** "Later" is not a one-way door: the
  sheet header carries a clock with a count, and it puts the parked cards back.
  A snooze you cannot return to is indistinguishable from a silent miss by the
  end of the day.
- **Answering removes the card from the list.** The deck is driven by what is
  still due, not by an index it keeps in step, so the deck and the data cannot
  disagree about which card is showing.
- Every commit is one tap, so every commit gets an undo toast. Without one a
  mis-tap is a permanent lie in a number about the reader's own discipline.

### Planner

A month of days, each carrying what falls on it.

It is not a date picker. `calendar-picker.tsx` is the picker — a transient
sheet that returns one date. The Planner is a **surface that stays on screen
and carries content on each day**. Different job, different component, and
they can both exist. What they cannot do is disagree about what a day looks
like, so the Planner inherits the picker's marks exactly:

- **Day marks are square**, like everything else. See Shape above for why the
  circle this originally specified could not be delivered.
- **Today is a gold hairline ring; selected is the gold fill** with
  `primary-foreground` numerals. Both have to be tellable apart at a glance,
  and there is only one gold.
- A day with activity carries a **3px round dot** under the numeral, and
  **opacity encodes how much** — this is already how reading density is
  drawn, via `readingDotStrength`. `primary` means the day happened;
  `destructive` means it was missed. Carry that meaning over rather than
  inventing a second vocabulary for the same idea.
- **The cell itself is still square** — no radius on the touch target, and
  no rules between cells. The gap is the separator; a grid of hairlines is
  exactly the decoration this system exists to avoid.
- Numerals are **`body-sm`**; the weekday header row is **`label-sm`
  uppercase muted**; the month name is **serif `headline-md`**.
- Days outside the month are `muted-foreground` at rest, never hidden — the
  grid should not change shape between months.

Where the Planner goes past the picker is the part the picker has no answer
for: **what a day carries.** Content on a day is a stack of at most two
`label-sm` rows plus a `+N` overflow. Past that the cell is unreadable at
phone width, and the day needs to open rather than expand.

### Timeline

A sequence of events, vertical.

It is not the capture feed. `timeline-entry.tsx` renders what you already
collected — book-grouped rows, a highlight-coloured swatch, a notes
carousel, no rail. PanelUI's Timeline is a **rail-and-node sequence of
events**. Again: different job, both allowed, but one shared vocabulary.

- The rail is a **1px `border` line** at the screen gutter, with **10px
  square** nodes — the same square mark, at the same size, that
  `timeline-entry` already uses for its indicator (`h-2.5 w-2.5`). The rail
  is structure, so it stays a hairline; the node is the event, so it takes
  the accent. Where an event has a colour of its own, the node takes it, the
  way the capture feed's swatch does.
- Event content sits on `card` with `soft` elevation — the same treatment as
  every other repeated item in the app, so a timeline reads as one calm
  surface rather than a column of floating tiles.
- Date groups get a **gold uppercase `label-sm` eyebrow**, matching every
  other section header in the app.
- Entries arrive with **`revealIn`, staggered 40ms, capped at six** — not a
  skeleton. The data is local.

### Why these coexist with what is already there

The app has a `timeline/` folder and a month grid already, and the new
components are **not** replacements for either:

| Existing | What it is | New | What it is |
| --- | --- | --- | --- |
| `calendar-picker.tsx` | A sheet that returns one date. An **input**, dismissed on tap. | `Planner` | A month that **stays** and carries content on each day. A **surface**. |
| `timeline-entry.tsx` | A row of the capture feed: book-grouped, highlight-coloured swatch, notes carousel. A **record of what you collected**. | `Timeline` | A rail of **events in sequence**. |

This is duplication of *shape*, which CLAUDE.md allows, not duplication of
*decisions*, which it does not. The decisions that must stay single are the
ones above: what a day mark looks like, what a square event indicator is,
what the accent means. Those are shared by reference to this document, not
by sharing a component. Two lists that happen to look similar can stay
separate; two places deciding what "today" looks like cannot.

### Installing them

PanelUI's CLI writes to `components/ui/` at the repo root. Move each file
into `src/components/ui/` and fix the path prefix in `panelui-lock.json`
afterwards. `RingChart` lands under a `charts/` subpath and draws with
`react-native-svg`, which is already a dependency (and already patched).

The five `--color-chart-*` tokens in `src/theme.css` are still on PanelUI's
shipped defaults with a comment saying to revisit them with real content in
front of you. This feature is that content: write the ramp above into both
theme blocks as part of the install, or the first chart drawn will be blue.


## Copy

Plain, simple English. Short sentences. Say the thing.

- **No em dashes in user-facing copy.** They are fine in code comments,
  which is how the rest of the codebase reads.
- **Samwell is a person: "he", never "it".** He is a reading companion, not
  a feature.
- Prefer the concrete over the encouraging. This app is built for honest
  self-development, so it says what actually happened rather than what would
  feel nice. No streak-shaming, no confetti, no manufactured urgency.
- Buttons are verbs. "Save the highlight", not "Submit".

## Do's and Don'ts

- **Do** put gold on exactly one thing per screen.
- **Don't** round a corner. Anywhere.
- **Do** reach for the surface ladder before reaching for a shadow or a
  border.
- **Don't** put a divider where a 32px gap already says "different section".
- **Do** use the serif for content and the sans for chrome, without
  exception.
- **Don't** invent a spacing value. If it is not 8, 16, or 32, ask what
  relationship you are trying to express.
- **Do** reveal real content in a stagger. **Don't** draw a skeleton for
  data that is already on the device.
- **Don't** use spring physics. One ease-out curve runs the whole app.
- **Do** let a component take data and callbacks as props. A component that
  reaches into a store or the router is one that can never be reused or
  looked at in isolation.
- **Do** keep components around 150 lines. Past that you are almost always
  looking at two components, or one component and a hook.

## Where this lives in code

- Colour tokens: `src/theme.css` (Uniwind/Tailwind semantic tokens, `light`
  and `dark` variants). Read them with a class, or `useCSSVariable` when a
  literal is unavoidable.
- Everything else: `src/constants/theme.ts` — `typography`, `spacing`,
  `layout`, `elevation`, `iconSize`, `motion`, `easing`, `popIn`,
  `revealIn`.
- Components: `src/components/ui/` is vendored PanelUI source managed by
  `panelui-lock.json`. Do not restructure it; the size rules above do not
  apply to it.
