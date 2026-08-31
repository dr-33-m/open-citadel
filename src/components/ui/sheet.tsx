import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
  useBottomSheetScrollableCreator,
  useBottomSheetSpringConfigs,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import React from 'react';
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { FlashList, type FlashListProps } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { MaxContentWidth } from '@/constants/theme';
import { useBackHandler } from '@/hooks/use-back-handler';
import { asColor } from '@/utils/colors';

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /**
   * Caps the sheet's height as a fraction of the window (0..1), for content
   * that has no bound of its own. Dynamic sizing (the default) fits whatever
   * the content measures; this is only the ceiling it stops at.
   */
  maxHeightRatio?: number;
  /**
   * Fixes the sheet at this fraction of the window (0..1) instead of sizing
   * to content. Only for a sheet whose content is a `flex: 1` region between
   * a pinned header and footer — that layout wants a stable height to flex
   * within, which is the opposite direction to dynamic sizing (which measures
   * content to DERIVE the height). Everything else should prefer
   * `maxHeightRatio`, which still shrinks to fit short content.
   */
  fixedHeightRatio?: number;
  /**
   * Set when `children` supply their own `Sheet.ScrollView` / `Sheet.FlatList`.
   *
   * The default wrapper is `BottomSheetView`, which registers itself with the
   * sheet as "content does not scroll". React runs child effects before parent
   * ones, so that registration always lands last and silently overwrites the
   * inner scrollable's — the sheet then refuses to hand it any scroll gesture.
   * `BottomSheetView` is also `position: 'absolute'` with no height, so nested
   * content has no bounded box to scroll within. This flag drops that wrapper
   * so the scrollable owns the content box.
   */
  scrollable?: boolean;
  /**
   * How the sheet reacts to the keyboard.
   *
   * - `interactive` (default) follows the keyboard height 1:1 — right for a
   *   sheet with content above the field, like a search box over a list.
   * - `extend` pushes the sheet to its largest detent, for a sheet whose only
   *   content is a field that should stay fully visible.
   * - `fillParent` takes the whole container.
   *
   * Note that this only ever fires for a field the sheet knows about: an
   * ordinary `TextInput` is invisible to it. Every field the app renders
   * through `components/ui/input` registers itself automatically (see
   * `use-sheet-text-input`), which is what makes this work at all.
   */
  keyboardBehavior?: 'interactive' | 'extend' | 'fillParent';
  /**
   * Turn off the sheet's content-drag gesture, leaving the grabber as the
   * only way to drag it.
   *
   * The sheet's content pan is an ancestor gesture, so it wins any vertical
   * drag inside the sheet that isn't a registered `Sheet.ScrollView` /
   * `Sheet.FlatList` — a plain scroller in there (a wheel picker, say) renders
   * but never moves. Giving the drag up is the fix when the content itself is
   * the thing that has to be draggable.
   */
  contentPanning?: boolean;
  /**
   * Drop the sheet's own chrome — background, grabber and bottom inset — so
   * the caller draws the whole surface itself. For a sheet whose content is
   * its own material (glass, a floating card); everything else wants the
   * house surface.
   */
  bare?: boolean;
};

/**
 * The bottom padding a sheet's *content* still owes, in dp.
 *
 * Zero when the shell has already paid it on a wrapper of its own, which is
 * the case for every sheet except one that scrolls at its natural height —
 * there the padding has to land inside the scroll content instead, or the
 * last row sits under the home indicator with nothing to scroll it clear.
 * `Sheet.ScrollView` and `Sheet.FlatList` read this and apply it themselves,
 * so no call site ever writes a bottom inset by hand.
 */
const SheetBottomInsetContext = React.createContext(0);

/*
 * The library exports its scrollables but not their prop types, so this is
 * read back off the component itself. `Sheet.FlatList` no longer builds on
 * `BottomSheetFlatList` — see `SheetFlatList` below — so its props are
 * FlashList's, which extend ScrollView's the same way FlatList's did, and
 * every existing call site keeps typing as before.
 */
type SheetScrollViewProps = Parameters<typeof BottomSheetScrollView>[0];

/**
 * The last value this had while `keep` was true.
 *
 * A sheet's content and the flag that opens it are almost always the same
 * piece of state — `visible={mode !== null}` over `{mode && <Body/>}` — so
 * closing blanks the content in the very same commit that starts the exit.
 * Under dynamic sizing that is fatal: the sheet derives its detent from a
 * live measurement of its content, measures zero, and collapses upward
 * leaving the grabber sitting on screen while the backdrop — which follows
 * the detent index — snaps off instantly. Observed on device before this
 * existed. Holding the last content keeps the sheet the size it was, so it
 * slides away as one piece.
 *
 * The effect runs after the commit, so on the commit where `keep` goes false
 * the ref still holds what was rendered while it was true — which is exactly
 * the frame that needs it.
 */
function useHeldWhile<T>(value: T, keep: boolean): T {
  const held = React.useRef(value);
  React.useEffect(() => {
    if (keep) held.current = value;
  });
  // Latching the previous value is the whole job; there is nothing to read but
  // the ref, and it is only read on the frames where `value` has already been
  // thrown away.
  // eslint-disable-next-line react-hooks/refs -- see above
  return keep ? value : held.current;
}

/**
 * House shell for every drawer/sheet in the app, over
 * `@gorhom/bottom-sheet`'s `BottomSheetModal` — a real Reanimated + Gesture
 * Handler pan, so the grabber is a control rather than a decoration and
 * `enablePanDownToClose` is what closes the sheet on a flick.
 *
 * Bridges the declarative `visible`/`onClose` API every call site already
 * uses onto the library's imperative `present()`/`dismiss()` ref, so a call
 * site only ever writes state. `onDismiss` is the single source of truth that
 * calls `onClose`, so it fires exactly once per dismissal whatever the cause:
 * a drag, a backdrop tap, or the parent flipping `visible` itself.
 *
 * ── Scrolling ─────────────────────────────────────────────────────────
 *
 * A sheet that scrolls MUST use `Sheet.ScrollView` / `Sheet.FlatList` and set
 * `scrollable` — a plain `ScrollView` inside a sheet never gets the scroll
 * gesture, because the sheet's own pan wins the touch and the sheet has no
 * idea the content wanted it. The library's scrollables register themselves
 * with the sheet so the two hand the gesture back and forth: at the top of the
 * list a downward drag moves the sheet, anywhere else it scrolls.
 *
 * ── The spacing contract ──────────────────────────────────────────────
 *
 * Padding inside a sheet belongs to the content, and this shell hands the
 * whole budget over rather than spending part of it first. Three rules, and
 * every sheet in the app follows them:
 *
 *  1. **Horizontal is the caller's, and it is one number.** The shell adds no
 *     gutter at all, so a call site's `px-6` (`layout.gutter`) is the *whole*
 *     gutter. Menu-style sheets, whose rows are the tap target, use `px-4`
 *     (`layout.gutterCompact`). A full-bleed list passes no gutter and pads
 *     its own rows, so the row highlight reaches the edges.
 *  2. **The top is already paid for.** The grabber carries 8 above and 12
 *     below it — 24dp down to the first row, which is the whole top padding a
 *     sheet gets. Call sites add nothing.
 *  3. **The bottom is the shell's, and only the shell's.** It pays
 *     `max(insets.bottom, 16)` on whichever box actually bounds the content
 *     (see `SheetBottomInsetContext`). Nothing here adds to it, and neither
 *     should a call site.
 *
 * Every corner is square via the theme's own zeroed radius scale
 * (src/theme.css); the radii below are explicit zeroes over the library's
 * rounded defaults, not a style choice made here.
 */
export function Sheet({
  visible,
  onClose,
  children,
  maxHeightRatio,
  fixedHeightRatio,
  scrollable = false,
  keyboardBehavior = 'interactive',
  contentPanning = true,
  bare = false,
}: SheetProps) {
  const ref = React.useRef<BottomSheetModal>(null);

  // Nothing of the library mounts until this sheet is opened for the first
  // time. A screen like Library or the section grid renders four or five
  // sheets, all closed; instantiating every `BottomSheetModal` (and its
  // portal registration and token subscriptions) up front is pure idle cost
  // and, over a long session, retained memory.
  //
  // A closed sheet unmounts again rather than staying resident for the life of
  // the app. What a dismissed modal leaves behind is not Android views — those
  // are torn down, and the view count is flat across dozens of open/close
  // cycles — it is the Reanimated side: shared values and the mappers that
  // write them to native. Those accumulate invisibly, and a screen full of
  // them is what makes a following screen transition lose its own native
  // commit and arrive invisible (Reanimated was caught still writing to
  // fourteen view tags whose views no longer existed). The cost is re-mounting
  // the modal on each open, which is a frame of work against a bug that
  // wedges the app.
  //
  // Adjusting state during render (React's documented escape hatch for
  // "remember something from a previous render"): the `setState` restarts
  // this component's render immediately, with no extra commit or paint, so
  // an open still mounts the modal in the very frame of the tap.
  const [mounted, setMounted] = React.useState(visible);
  if (visible && !mounted) setMounted(true);

  const insets = useSafeAreaInsets();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const [popover, border, mutedForeground, scrim] = useCSSVariable([
    '--color-popover',
    '--color-border',
    '--color-muted-foreground',
    '--color-scrim',
  ]);

  // Never dismiss a modal that was never presented. The library's `dismiss()`
  // early-exits only for CLOSED/MINIMIZED/DISMISSING, but a fresh modal's
  // status is INITIAL — so the call falls through, sets the status to
  // DISMISSING and registers a pending unmount with the provider. `present()`
  // never resets that status, leaving the sheet wedged: it renders, but no tap
  // ever opens it. Sheets mounted with `visible` already true never hit this,
  // which is why those were the only ones that worked.
  const hasPresented = React.useRef(false);

  // Clearing the flag here is what stops a user-driven dismissal (drag or
  // backdrop) from bouncing: the library fires this, we call onClose, the
  // parent flips `visible` false, and the effect below would otherwise call
  // dismiss() a second time and fire onClose again.
  //
  // This is also the signal that the exit animation has finished, so it is
  // where the modal unmounts: any earlier and the sheet would vanish instead
  // of sliding away (`useHeldWhile` exists for exactly that frame). Safe to do
  // synchronously — the library fires this as the last statement of its own
  // `unmount()`, after it has already reset its variables and deregistered the
  // sheet and its portal, so there is nothing left underneath us to tear down.
  //
  // `onClose` runs first and is what flips `visible` false, and React batches
  // both updates into the same render. In the pathological case where a call
  // site's `onClose` does not flip it, the render-phase latch above simply
  // mounts the modal again on the next render — one wasted render rather than
  // a sheet that reopens itself.
  const handleDismiss = React.useCallback(() => {
    hasPresented.current = false;
    onClose();
    setMounted(false);
  }, [onClose]);

  // `useLayoutEffect`, not `useEffect`: presenting is the response to a tap
  // and every frame between the two is dead air. This one fires before the
  // paint that follows the state change instead of after it.
  React.useLayoutEffect(() => {
    if (visible) {
      hasPresented.current = true;
      ref.current?.present();
    } else if (hasPresented.current) {
      hasPresented.current = false;
      ref.current?.dismiss();
    }
  }, [visible]);

  // An open sheet owns the Android back button: back dismisses the sheet
  // rather than popping the screen behind it and orphaning it. The library
  // installs no handler of its own, so this is the only thing standing
  // between a back press and navigating out from under an open drawer.
  //
  // It asks the sheet to dismiss rather than calling `onClose` directly: the
  // dismissal has to actually animate, and `onDismiss` is what reports it
  // back up afterwards. Going straight to `onClose` would flip `visible` to
  // false with the sheet still on screen and no way left to close it.
  useBackHandler(visible, () => ref.current?.dismiss());

  const renderBackdrop = React.useCallback(
    (props: BottomSheetBackdropProps) => (
      // The library's defaults assume several detents (the backdrop only
      // appears past index 1); our sheets are a single detent, so index 0 IS
      // open. `--color-scrim` carries its own alpha — the theme tuned that
      // number per mode — so the backdrop is drawn at full opacity and the
      // colour does the dimming.
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={1}
        pressBehavior="close"
        style={[props.style, { backgroundColor: asColor(scrim) }]}
      />
    ),
    [scrim],
  );

  /**
   * On a phone this is 0 and the sheet is edge to edge, exactly as before. On
   * anything wider — tablet, foldable, landscape — it becomes a centred column
   * capped at the app's content width instead of a slab with its content
   * stranded in middle distance. It lands on the hosting container rather than
   * on the sheet itself, because the library pins the sheet's own box to
   * `left: 0, right: 0` and a width set there would only shrink it leftwards.
   */
  const sideInset = Math.max(0, (screenWidth - MaxContentWidth) / 2);

  const snapPoints = React.useMemo(
    () => (fixedHeightRatio != null ? [`${Math.round(fixedHeightRatio * 100)}%`] : undefined),
    [fixedHeightRatio],
  );

  /** Rule 3 of the spacing contract. */
  const bottomInset = bare ? 0 : Math.max(insets.bottom, 16);

  /**
   * The house spring, in Apple's two designer parameters rather than
   * mass/stiffness/damping. The library's Android default is a 250ms
   * `Easing.out(Easing.exp)`, which covers most of its travel in the first
   * few frames and crawls the rest — next to the app's drawers and screen
   * transitions, all of which use this, that reads as a different object.
   * A little under critically damped, so it settles without a bounce: a
   * sheet that overshoots reads as light, and a sheet is not light.
   *
   * 300, not 420: the library uses one spring for both directions, and the
   * open is tap-driven — the longer settle was reading as hesitation before
   * the sheet had committed to appearing (the "did my tap land" pause). This
   * lands it in the same 220–300ms band as the screen transitions' own
   * `SIDE_OPEN`.
   */
  const animationConfigs = useBottomSheetSpringConfigs({
    duration: 300,
    dampingRatio: 0.9,
  });

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        container: { paddingHorizontal: sideInset },
        background: {
          backgroundColor: asColor(popover),
          borderRadius: 0,
          // Docked: the sheet is continuous with the bottom of the screen, so
          // the bottom edge is not a real edge and a line along it would be a
          // rule through the middle of nothing.
          borderTopWidth: StyleSheet.hairlineWidth,
          borderLeftWidth: StyleSheet.hairlineWidth,
          borderRightWidth: StyleSheet.hairlineWidth,
          borderColor: asColor(border),
        },
        handle: { paddingTop: 8, paddingBottom: 12 },
        handleIndicator: {
          width: 40,
          height: 4,
          borderRadius: 2,
          backgroundColor: asColor(mutedForeground),
          opacity: 0.3,
        },
        // A fixed-height sheet needs a flex box for its children to size
        // against — that is the whole point of asking for a fixed height.
        fill: { flex: 1, paddingBottom: bottomInset },
        padded: { paddingBottom: bottomInset },
      }),
    [popover, border, mutedForeground, sideInset, bottomInset],
  );

  // See `useHeldWhile`: the content of a closing sheet is usually already
  // gone by the time the exit starts.
  const heldChildren = useHeldWhile(children, visible);

  let body: React.ReactNode;
  let contentOwesBottomInset = 0;
  if (fixedHeightRatio != null) {
    // The shell owns the box, so it pays the inset here and the content —
    // scroll region, pinned footer, whatever the caller composed — flexes
    // inside what is left.
    body = <View style={styles.fill}>{heldChildren}</View>;
  } else if (scrollable) {
    // A dynamically-sized scrollable reports its own content height to the
    // sheet, so it can take no wrapper at all: the padding has to go inside
    // the scroll content instead.
    body = heldChildren;
    contentOwesBottomInset = bottomInset;
  } else {
    body = <BottomSheetView style={styles.padded}>{heldChildren}</BottomSheetView>;
  }

  // Every hook above has run — this is a safe conditional return. Skips the
  // whole `BottomSheetModal` subtree while the sheet is closed (see `mounted`).
  if (!mounted) return null;

  return (
    <BottomSheetModal
      ref={ref}
      // Never under the status bar, whatever the content measures to.
      topInset={insets.top}
      enableDynamicSizing={fixedHeightRatio == null}
      snapPoints={snapPoints}
      maxDynamicContentSize={
        maxHeightRatio != null ? screenHeight * maxHeightRatio : undefined
      }
      animationConfigs={animationConfigs}
      enableContentPanningGesture={contentPanning}
      keyboardBehavior={keyboardBehavior}
      // The library default is 'none', which means the sheet stays wherever
      // the keyboard pushed it and never comes back down when it hides.
      keyboardBlurBehavior="restore"
      // 'adjustResize' here would tell the library that Android's window
      // shrinks for the keyboard and that it therefore has to do nothing —
      // it zeroes the keyboard height and leaves the sheet where it is. This
      // app is edge to edge, so the window does NOT resize (the same reason
      // the Samwell screen reserves keyboard space by hand rather than using
      // a KeyboardAvoidingView), and the sheet has to do the lifting itself.
      android_keyboardInputMode="adjustPan"
      backdropComponent={renderBackdrop}
      containerStyle={styles.container}
      backgroundStyle={bare ? undefined : styles.background}
      backgroundComponent={bare ? null : undefined}
      handleComponent={bare ? null : undefined}
      handleStyle={styles.handle}
      handleIndicatorStyle={styles.handleIndicator}
      onDismiss={handleDismiss}
    >
      <SheetBottomInsetContext.Provider value={contentOwesBottomInset}>
        {body}
      </SheetBottomInsetContext.Provider>
    </BottomSheetModal>
  );
}

/**
 * The sheet's scroll region. A drag on the rows scrolls the list; a drag at
 * the top of it hands back to the sheet and drags the sheet itself. Pays the
 * sheet's bottom inset inside the scroll content when the shell has left it
 * to the content (see `SheetBottomInsetContext`).
 */
function SheetScrollView({ contentContainerStyle, ...props }: SheetScrollViewProps) {
  const bottomInset = React.useContext(SheetBottomInsetContext);
  return (
    <BottomSheetScrollView
      {...props}
      contentContainerStyle={
        bottomInset > 0
          ? ([contentContainerStyle, { paddingBottom: bottomInset }] as StyleProp<ViewStyle>)
          : contentContainerStyle
      }
    />
  );
}

/**
 * The sheet's list region. Same gesture handoff as `Sheet.ScrollView`.
 *
 * ── Why FlashList, not FlatList ───────────────────────────────────────
 *
 * `BottomSheetFlatList` is RN's FlatList wearing the sheet's gesture
 * machinery, and FlatList throws cells away: a row that scrolls out is
 * unmounted — its native views torn down — and rebuilt from scratch when it
 * scrolls back. FlashList recycles the underlying views instead, re-binding
 * an offscreen cell to new data, which is most of the difference between a
 * list that stutters and one that doesn't on a low-end Android device. v2
 * also measures rows synchronously, so fast scrolls don't flash blank cells
 * and there is no `estimatedItemSize` to guess.
 *
 * The integration is the library's own blessed one (`useBottomSheetScrollableCreator`,
 * which the deprecated `BottomSheetFlashList` did internally): FlashList gets
 * a `BottomSheetScrollView` as its scroll component, so the sheet still owns
 * the gesture handoff, the keyboard interaction and the scroll registration —
 * the incoming `onScroll`/`onScrollBeginDrag` the list passes through are
 * merged into the sheet's scroll handler, not clobbered by it.
 *
 * Recycling's one contract: a recycled cell keeps whatever a previous row set
 * on it, so row components must set every conditional branch explicitly —
 * never "omit and fall back". The app's lists already render that way (see
 * the recycling notes in samwell-compass-timeline and chat-history-sheet).
 */
function SheetFlatList<ItemT>({
  contentContainerStyle,
  ...props
}: FlashListProps<ItemT>) {
  const bottomInset = React.useContext(SheetBottomInsetContext);
  const renderScrollComponent = useBottomSheetScrollableCreator();
  return (
    <FlashList<ItemT>
      {...props}
      renderScrollComponent={renderScrollComponent}
      scrollEventThrottle={16}
      contentContainerStyle={
        bottomInset > 0
          ? ([contentContainerStyle, { paddingBottom: bottomInset }] as StyleProp<ViewStyle>)
          : contentContainerStyle
      }
    />
  );
}

Sheet.ScrollView = SheetScrollView;
Sheet.FlatList = SheetFlatList;

export { SheetFlatList, SheetScrollView };
