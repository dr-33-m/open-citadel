import { Image } from 'expo-image';
import React from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import type { LucideIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { TextSwitch, type TextSwitchOption } from '@/components/text-switch';
import { Card } from '@/components/ui/card';
import { Touchable } from '@/components/ui/touchable';
import { motion } from '@/constants/theme';
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
 * card lifts by the drawer's whole height (two rows of tiles, about 150dp)
 * and a tile lands on the exact pixels the handle occupied a moment ago.
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
/** The glyph: an icon at this size, or the cover of what the chat holds. */
const GLYPH = 14;
const COVER = { width: GLYPH, height: GLYPH } as const;
/**
 * The state line, a step under `bodySm`. At `bodySm` it was larger than the
 * name above it, so "3 activities" outweighed PLANNER and the tile read as a
 * figure with a caption: the dashboard this drawer keeps having to avoid.
 */
const DETAIL_TEXT = { fontSize: 12, lineHeight: 16 } as const;

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
   * The one thing this mode is for, given the first tile of the first row:
   * logging today in Compass, the book in a chat (`toolboxRows`).
   *
   * Exactly one item per mode should carry it, so the thing you press every
   * morning is where the thumb lands first rather than wherever it was listed.
   */
  lead?: boolean;
};


/**
 * One tool, as a tile: its name, then its icon and the state it is in.
 *
 * A third of a row wide and two lines tall: the name, then the icon with one
 * muted line of state beside it. It still says "press me" rather than
 * "read me", which is what sank the grid before it (a stack of icon, name and
 * figure is `StatCard`, and five of them read as a dashboard): it is a raised
 * `tile` with a border and a lift like every other button in the app, it ticks
 * under the finger, and its state is a short muted line, never a serif figure.
 *
 * Memoised. The screen above re-renders on every streamed token, and these
 * tiles sit inside a drawer that is usually shut, so without a memo they
 * re-rendered invisibly a few dozen times a second during a reply. The rows
 * are memoised by the caller to match.
 */
const Tool = React.memo(function Tool({
  item,
  muted,
  gold,
  foreground,
}: {
  item: ToolboxItem;
  muted?: string;
  gold?: string;
  foreground?: string;
}) {
  const Icon = item.icon;
  const tint = item.active ? gold : foreground;

  return (
    <Touchable
      // `tile` is the ground a book cover sits on, and these are the same kind
      // of object: something resting ON a panel rather than part of it.
      // `shadow-sm` is PanelUI's own card weight; the app's `elevation.soft` is
      // for covers and lands as a hard drop at button scale.
      className={cn(
        'flex-1 gap-1 border border-border bg-tile px-2.5 py-2 shadow-sm',
        !item.onPress && 'opacity-35',
      )}
      onPress={item.onPress}
      onLongPress={item.onLongPress}
      // A tool with nothing to open is dimmed AND inert. Leaving `onPress` off
      // alone still dimmed and ticked under the finger, a working button's
      // whole vocabulary for a press that then did nothing.
      disabled={!item.onPress}
      haptic="select"
      accessibilityRole="button"
      accessibilityState={{ selected: item.active, disabled: !item.onPress }}
      accessibilityLabel={item.detail ? `${item.label}, ${item.detail}` : item.label}
    >
      <ThemedText type="labelSm" color={tint} numberOfLines={1}>
        {item.label.toUpperCase()}
      </ThemedText>
      {/* The icon rides on the state line rather than taking a line of its
          own above the name: beside the name it would cut LOG TODAY and BLOG
          POST short in a third of a row, while the state is short or is the
          thing that truncates anyway (a book's title). */}
      <View className="flex-row items-center gap-1.5">
        {item.image ? (
          // The cover stands in for the icon once something is picked.
          <Image source={{ uri: item.image }} style={COVER} contentFit="cover" />
        ) : (
          <Icon size={GLYPH} color={tint} strokeWidth={2} />
        )}
        {/* Always drawn, empty when there is nothing to say, so every tile
            in a row is the same height. */}
        <ThemedText type="bodySm" color={muted} numberOfLines={1} style={DETAIL_TEXT} className="shrink">
          {item.detail ?? ' '}
        </ThemedText>
      </View>
    </Touchable>
  );
});

/** The tools in rows of up to three, each row shared out evenly by its tiles. */
function ToolRows({
  rows,
  muted,
  gold,
  foreground,
}: {
  rows: ToolboxItem[][];
  muted?: string;
  gold?: string;
  foreground?: string;
}) {
  return rows.map((row) => (
    <View key={row.map((item) => item.id).join('|')} className="flex-row gap-2">
      {row.map((item) => (
        <Tool key={item.id} item={item} muted={muted} gold={gold} foreground={foreground} />
      ))}
    </View>
  ));
}

/**
 * Samwell's tools, on a card the control unit lies on top of.
 *
 * ## What is in here
 *
 * The control unit above keeps what is true of every conversation: what you
 * are writing, and a fresh start. Every tool lives down here, under a switch
 * between Reading (the book, post or episode the chat is about) and Compass
 * (the deck, planner, insights and archive), with the brain and the history
 * under both. Tabs rather than headed sections, so the drawer stays the
 * height of one kind of tool instead of stacking both. That is
 * what stops that row growing a button every time Samwell gains a surface.
 * It had reached seven.
 *
 * ## Why rows of tiles
 *
 * It has been a grid twice and a list of full-width rows once. The list read
 * well, a row per tool with its state on the trailing edge, but at five or six
 * rows under a tab switch the drawer climbed most of the way up the screen and
 * pushed the conversation out of view (owner's call, 2026-11-10). So the tools
 * are tiles again, three to a row: the tab's own tools first, the brain and
 * the history under them (`toolboxRows`), every row shared out evenly so
 * there is never a hole. What kept the earlier grids from reading as controls
 * is answered in the tile itself; see `Tool`.
 *
 * The `detail` is what separates this from a drawer of labels: `PLANNER` is a
 * noun, `PLANNER / 5 activities` answers whether it is worth opening.
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
 * Memoised, with `rows` memoised by the caller to match. The screen above
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
function ToolboxCard<T extends string>({
  open,
  tabs,
  tab,
  onTabChange,
  rows,
}: {
  open: boolean;
  /** The kinds of tool, as a switch along the top: Reading, Compass. */
  tabs: readonly TextSwitchOption<T>[];
  tab: T;
  onTabChange: (tab: T) => void;
  /** The showing tab's tools, then the conversation's own, in rows (`toolboxRows`). */
  rows: ToolboxItem[][];
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
  // Disarmed on the edge where the drawer shuts, during render rather than in
  // the effect, so a shut drawer is never armed for a frame.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setArmed(false);
  }
  React.useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setArmed(true), TOOLBOX_SETTLE);
    return () => clearTimeout(timer);
  }, [open]);

  const frameStyle = useAnimatedStyle(() => ({
    height: progress.value * height.value,
    marginTop: progress.value * -OVERLAP,
  }));

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

        <Card.Content className="gap-2 p-2 pt-0">
          <TextSwitch options={tabs} value={tab} onChange={onTabChange} />
          <ToolRows rows={rows} muted={muted} gold={gold} foreground={ink} />
        </Card.Content>
      </Card>
    </Animated.View>
  );
}

// Memoised with its generic kept: `React.memo` alone would widen the tab type to string.
export const SamwellToolbox = React.memo(ToolboxCard) as typeof ToolboxCard;
