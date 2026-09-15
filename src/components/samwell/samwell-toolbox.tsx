import { Image } from 'expo-image';
import React from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { ChevronRight, type LucideIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Touchable } from '@/components/ui/touchable';
import { iconSize, motion } from '@/constants/theme';
import { useCollapseHeight } from '@/hooks/use-collapse-height';
import { cn } from '@/lib/cn';
import { asColor } from '@/utils/colors';

/**
 * How far the control unit lies over the toolbox, in points.
 *
 * The toolbox is a whole card with four borders, and this much of its top —
 * border included — sits behind the card above it, so what you see is one card
 * resting on another rather than a tall box with a rule across it. Big enough
 * that the overlap is unmistakable, small enough that it never eats the tools.
 */
const OVERLAP = 14;

/**
 * How much narrower the toolbox is than the control unit, per side.
 *
 * Without this the two are one entity and every other cue is wasted. Two
 * rectangles sharing a left edge and a right edge have a single silhouette,
 * and the eye reads the outline before it reads tone, shadow or overlap: what
 * it sees is one tall card with a line across it.
 *
 * So the card behind is narrower and the one in front overhangs it, which is
 * what a stack of cards looks like from above. An earlier attempt used a GAP
 * instead and failed the opposite way — two cards floating apart, related by
 * nothing. Inset plus overlap is a stack; either alone is not.
 */
const INSET = 8;

/**
 * How long after the drawer starts opening before its tools accept a press.
 *
 * Opening MOVES THE BUTTON YOU JUST PRESSED. The stack is anchored to the
 * bottom of the screen and the drawer opens beneath the control unit, so the
 * card lifts by the drawer's whole height — 112dp in chat, 263dp in Compass —
 * and a tool row lands on the exact pixels the handle occupied a moment ago.
 *
 * That turned an impatient second tap into a trap. On device: tap the handle,
 * the drawer opens, tap again where the handle was, and the row now sitting
 * there fires — which shuts the drawer and raises a sheet. Dismiss the sheet
 * and the drawer is closed, so the whole thing reads as "I pressed it three
 * times and it never opened", with every press giving feedback and a tick.
 *
 * So the tools stay inert until the drawer has arrived and the hand has had a
 * beat to catch up: the animation, plus half a second of grace. Measured on
 * device, a repeat tap lands anywhere from 200ms to 550ms after the first, and
 * reaching a row on purpose cannot beat that window — it means seeing the
 * drawer, reading a label and moving a thumb the better part of the screen,
 * which is most of a second before the finger is anywhere near.
 *
 * `SamwellControlCenter`'s handle is held for the same window by the caller,
 * which is what stops the other version of the same bug — a double tap that
 * opens and shuts the drawer inside 300ms, too fast to see.
 */
export const TOOLBOX_SETTLE = motion.base + 500;

/*
 * Constant styles, hoisted out of render.
 *
 * A fresh object every render is a fresh prop identity, which defeats the memo
 * on the row below and gives Fabric a changed style to diff for no reason.
 * These three never vary, so they are built once.
 */
const CARD_POSITION = { position: 'absolute', left: INSET, right: INSET, bottom: 0 } as const;
const OVERLAP_SPACER = { height: OVERLAP } as const;
/** The icon box, at the two sizes a row comes in. */
const LEAD_GLYPH = { width: iconSize.default, height: iconSize.default } as const;
const ROW_GLYPH = { width: 18, height: 18 } as const;

export type ToolboxItem = {
  id: string;
  icon: LucideIcon;
  label: string;
  /**
   * The state this tool is in, shown on its trailing edge: how many are due,
   * which book is loaded, how many goals are archived.
   *
   * This is most of what stops the drawer being a grid of blanks. An icon and
   * a noun say what a control opens; they say nothing about whether it is
   * worth opening right now, and that is the question somebody actually has.
   */
  detail?: string | null;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Drawn in place of the icon — the cover of the book a chat is pinned to. */
  image?: string | null;
  /** Lit in gold: this tool is holding something, or is already the mode. */
  active?: boolean;
  /**
   * The one thing this mode is for, given the full width and the top of the
   * card: logging today in Compass, the book in a chat.
   *
   * Exactly one item per mode should carry it. Without a lead, every control
   * is drawn at the same size and the thing you press every morning competes
   * with the one you press twice a month.
   */
  lead?: boolean;
};

/**
 * One tool: an icon, its name, the state it is in, and a chevron.
 *
 * A ROW, and every one of them, which is the difference between this drawer
 * reading as controls and reading as a readout. The version before this laid
 * the secondary tools out as a two-column grid with the state stacked under
 * the label — which is exactly this app's `StatCard`, the thing it uses for
 * numbers you look at. They were the right information in the wrong clothes:
 * four little dashboards where four buttons should be.
 *
 * So they borrow the shape the app already uses for "this opens something":
 * the overview's side-goal card and the archive's rows. Icon on the left,
 * name, state on the trailing edge, chevron. Nothing stacks, so nothing reads
 * as a figure, and a fifth or an eighth tool just makes the list longer.
 *
 * Memoised. The screen above this one re-renders on every streamed token, and
 * these rows sit inside a drawer that is usually shut — so without a memo they
 * re-rendered, invisibly, a few dozen times a second during a reply. The
 * caller memoises the item list to match; both halves are needed, since a memo
 * is worth nothing against a prop rebuilt every render.
 */
const Tool = React.memo(function Tool({
  item,
  lead,
  muted,
  gold,
  foreground,
}: {
  item: ToolboxItem;
  /** The one thing this mode is for: heavier label, and it sits on top. */
  lead: boolean;
  muted?: string;
  gold?: string;
  foreground?: string;
}) {
  const Icon = item.icon;
  const tint = item.active ? gold : foreground;
  const glyph = lead ? iconSize.default : 18;

  return (
    <View className="p-1">
      <Touchable
        // `tile` is the ground a book cover sits on, and these are the same
        // kind of object: something resting ON a panel rather than part of it.
        // With a lift under them they read as pressable; flat and borderless
        // they read as rows of text.
        //
        // `shadow-sm`, PanelUI's own card weight, not the app's
        // `elevation.soft` — that token is for book covers and timeline cards,
        // and at button scale it lands as a hard drop instead of a lift.
        className={cn(
          'flex-row items-center gap-3 border border-border bg-tile px-3 shadow-sm',
          lead ? 'py-3' : 'py-2.5',
          !item.onPress && 'opacity-35',
        )}
        onPress={item.onPress}
        onLongPress={item.onLongPress}
        // A tool with nothing to open is dimmed AND inert. Without the
        // `disabled`, leaving `onPress` off only removed the action: the row
        // still dimmed under the finger and still ticked, so it answered a
        // press with the full vocabulary of a working button and then did
        // nothing — which is the exact shape of "it reacts, it just doesn't
        // do anything".
        disabled={!item.onPress}
        haptic="select"
        accessibilityRole="button"
        accessibilityState={{ selected: item.active, disabled: !item.onPress }}
        accessibilityLabel={item.detail ? `${item.label}, ${item.detail}` : item.label}
      >
        {item.image ? (
          <Image
            source={{ uri: item.image }}
            style={lead ? LEAD_GLYPH : ROW_GLYPH}
            contentFit="cover"
          />
        ) : (
          <Icon size={glyph} color={tint} strokeWidth={2} />
        )}

        {/*
          The name never shrinks; the state takes what is left and truncates.

          This was the other way round — the name on `flex-1` and the state
          unconstrained — and a long `detail` then ate the whole row. A book
          title is the worst case and the one that showed it: "How it Works /
          Dealing in simple language…" squeezed the word BOOK to nothing and
          pushed the chevron off the card. Labels here are one or two short
          words and always fit; a title is arbitrary, so it is the thing that
          gives way.
        */}
        <ThemedText type={lead ? 'labelMd' : 'labelSm'} color={tint} numberOfLines={1}>
          {item.label.toUpperCase()}
        </ThemedText>

        <ThemedText
          type="bodySm"
          color={muted}
          numberOfLines={1}
          className="flex-1 text-right"
        >
          {item.detail ?? ''}
        </ThemedText>

        {/* The mark that says this is a control and not a reading. Every row
            in the app that opens something carries it. */}
        <ChevronRight size={15} color={muted} strokeWidth={2} />
      </Touchable>
    </View>
  );
});

/**
 * The mode's own tools, on a card the control unit lies on top of.
 *
 * ## What is in here
 *
 * The control unit above keeps what is true of every session: what you are
 * writing, and which mode you are in. Everything a mode brings with it lives
 * down here — Compass's deck, planner, insights and archive, chat's book and
 * history — which is what stops that row growing a button every time a mode
 * gains a surface. It had reached seven.
 *
 * ## Why it is a list and not a grid
 *
 * It was a grid twice, and a grid is what a drawer looks like when nobody
 * decided anything: five controls at one size, differing by an icon and a
 * word, saying nothing about themselves, with a hole where the sixth would be.
 * It does not scale either — a seventh control makes the hole worse, and there
 * is nowhere to put a control that needs more than one word.
 *
 * Then it was a grid with the state stacked under each label, and that was the
 * same mistake wearing better clothes: an icon over a name over a figure is
 * this app's `StatCard`, so five buttons came out looking like a dashboard.
 *
 * A list of rows fixes both. Every row is the shape the app already uses for
 * "this opens something" — the overview's side goals, the archive's rows —
 * with the state on the trailing edge instead of stacked, and a chevron saying
 * it is a control. The lead sits on top with a heavier label because it is
 * what the mode is FOR; an eighth tool just makes the list longer.
 *
 * The `detail` is what separates this from a drawer of labels: `PLANNER` is a
 * noun, `PLANNER … 5 activities` answers whether it is worth opening.
 *
 * ## The motion
 *
 * One ease-out at `motion.base`, no spring, and the card grows UPWARD.
 *
 * Its content is pinned to the bottom of the frame rather than the top, so
 * what you see is the card rising into place and lifting the control unit
 * ahead of it, settling once its top has slid the overlap's depth beneath it.
 * Pinned to the top the same animation reveals top-down, like a blind coming
 * down, which is the opposite reading.
 *
 * Memoised, with `items` memoised by the caller to match. The screen above
 * re-renders on every streamed token; without both halves this whole drawer
 * re-rendered a few dozen times a second while shut.
 *
 * It deliberately does not use the planner carousel's spring, which an earlier
 * version did. That spring is right for the day cards because you DRAG them:
 * overshoot belongs to motion the gesture gave momentum to. This opens from a
 * button tap, so a bounce is the interface inventing energy nobody put in, and
 * it reads as slow because it keeps moving after it has arrived. The house
 * tokens say it in a line: slow and elegant, no spring physics, ease-out.
 */
export const SamwellToolbox = React.memo(function SamwellToolbox({
  open,
  items,
}: {
  open: boolean;
  items: ToolboxItem[];
}) {
  const [primary, mutedForeground, foreground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
    '--color-foreground',
  ]);
  const gold = asColor(primary);
  const muted = asColor(mutedForeground);
  const ink = asColor(foreground);

  /*
   * Measured once and animated since. Shared with the Samwell tip via
   * `useCollapseHeight` — the toolbox proved the pattern on device and the tip
   * needed it, so there is one implementation rather than two.
   */
  const { progress, height, onLayout } = useCollapseHeight(open);

  /*
   * The tools are dead until the drawer has settled — see `TOOLBOX_SETTLE`.
   * `pointerEvents` rather than disabling each row, so a stray tap falls
   * through to the page instead of lighting up a control that ignores it.
   */
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    if (!open) {
      setArmed(false);
      return;
    }
    const timer = setTimeout(() => setArmed(true), TOOLBOX_SETTLE);
    return () => clearTimeout(timer);
  }, [open]);

  const frameStyle = useAnimatedStyle(() => ({
    height: progress.value * height.value,
    marginTop: progress.value * -OVERLAP,
  }));

  // The lead first, then the rest in the order the caller gave them.
  const lead = items.find((item) => item.lead) ?? null;
  const ordered = lead ? [lead, ...items.filter((item) => item !== lead)] : items;

  return (
    <Animated.View
      style={frameStyle}
      pointerEvents={armed ? 'auto' : 'none'}
      className="overflow-hidden"
    >
      <Card
        onLayout={onLayout}
        // Pinned to the BOTTOM of the frame: see the motion note above. This
        // is what makes the card rise rather than unroll.
        style={CARD_POSITION}
        /*
         * The page's own ground, so the `tile` buttons on it have somewhere to
         * sit in BOTH themes.
         *
         * This was `muted`, and that quietly broke the light theme: parchment
         * defines `--color-muted` and `--color-tile` as the same value, so the
         * buttons and the tray they sat on were one colour and only their
         * borders separated them. Every other candidate collapses in one theme
         * or the other — `card` equals `tile` on obsidian — and `background`
         * is the only surface `tile` steps off in both, which is exactly what
         * that token was cut for.
         *
         * It still reads as a card and not as the page: it has a border, its
         * own shadow, the `INSET`, and the control unit lying across its top.
         *
         * It keeps `Card`'s own `shadow-sm`. An earlier version killed it on
         * the theory that the card in front should own the shadow for the
         * pair, and that left this one sitting flat on the page while every
         * other card in the app has a little weight. The frame above clips to
         * animate the height, and the `INSET` is what leaves room for the
         * shadow to spread into rather than being cut off at the edge.
         *
         * Square corners though: `rounded-2xl` is PanelUI's default, not this
         * app's, which is square throughout.
         */
        className="rounded-none bg-background"
      >
        {/* The strip that lives behind the card above. A spacer rather than
            padding, so `OVERLAP` is stated once and the two things that depend
            on it — what is hidden, and how far the card is pulled up — can
            never drift apart. */}
        <View style={OVERLAP_SPACER} />

        <Card.Content className="p-1 pt-0">
          {ordered.map((item) => (
            <Tool
              key={item.id}
              item={item}
              lead={item === lead}
              muted={muted}
              gold={gold}
              foreground={ink}
            />
          ))}
        </Card.Content>
      </Card>
    </Animated.View>
  );
});
