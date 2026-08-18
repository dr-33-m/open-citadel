import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';

import { useColors } from '@/hooks/use-colors';

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /**
   * Caps the sheet's height as a fraction of the window (0..1), for content
   * that has no bound of its own — most sheets don't need this, since their
   * own internal lists already cap their height (`style={{ maxHeight: N }}`),
   * and dynamic sizing (the default) just fits whatever that resolves to.
   */
  maxHeightRatio?: number;
  /**
   * Fixes the sheet at this fraction of the window (0..1) instead of sizing
   * to content. Only for a sheet whose content is a `flex: 1` scroll region
   * between a pinned header and footer — that layout wants a stable height to
   * flex within, which is incompatible with dynamic sizing (which measures
   * content to DERIVE the height, the opposite direction). Everything else
   * should prefer `maxHeightRatio`, which still shrinks to fit short content.
   */
  fixedHeightRatio?: number;
  /**
   * Set when `children` supply their own `BottomSheet{ScrollView,FlatList}`.
   *
   * The default wrapper is `BottomSheetView`, which registers itself with the
   * sheet as `SCROLLABLE_TYPE.VIEW` ("content does not scroll"). React runs
   * child effects before parent ones, so that registration always lands last
   * and silently overwrites the inner scrollable's — the sheet then refuses to
   * hand it any scroll gesture. `BottomSheetView` is also `position:'absolute'`
   * with no height, so nested content has no bounded box to scroll within.
   * This flag drops that wrapper so the scrollable owns the content box.
   */
  scrollable?: boolean;
  /**
   * How the sheet reacts to the keyboard. Only worth overriding for a sheet
   * whose only content is a text field that should push the sheet up to stay
   * fully visible ('extend') instead of the default ('interactive', which
   * follows the keyboard height 1:1 — right for a sheet with content above
   * the field, like a search box over a list).
   */
  keyboardBehavior?: 'interactive' | 'extend' | 'fillParent';
};

/**
 * House shell for every drawer/sheet in the app, replacing the hand-rolled
 * `<Modal transparent animationType="slide">` + backdrop `View` + sliding
 * panel pattern every sheet used to repeat. That pattern had no gesture
 * recognizer wired to it at all — the little grabber bar was decorative, and
 * nothing responded to a drag. This wraps `@gorhom/bottom-sheet`'s
 * `BottomSheetModal`, which is real drag-to-dismiss (a Reanimated + Gesture
 * Handler pan, not a system sheet, but it looks and behaves like one on both
 * platforms) — `enablePanDownToClose` defaults to true on the modal variant.
 *
 * Bridges the old declarative `visible`/`onClose` API every call site already
 * uses onto the library's imperative `present()`/`dismiss()` ref, so a sheet
 * migrating to this only has to swap its outer Modal shell for `<Sheet>` —
 * the sheet's own content and its parent's open/close state logic don't
 * change. `onDismiss` is the single source of truth that calls `onClose`, so
 * it fires exactly once per dismissal whatever the cause: a drag, a backdrop
 * tap, or the parent flipping `visible` itself.
 *
 * No rounded corners, per house style: every corner here is explicitly 0.
 */
export function Sheet({
  visible,
  onClose,
  children,
  maxHeightRatio,
  fixedHeightRatio,
  scrollable = false,
  keyboardBehavior,
}: SheetProps) {
  const colors = useColors();
  const ref = React.useRef<BottomSheetModal>(null);

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
  const handleDismiss = React.useCallback(() => {
    hasPresented.current = false;
    onClose();
  }, [onClose]);

  React.useEffect(() => {
    if (visible) {
      hasPresented.current = true;
      ref.current?.present();
    } else if (hasPresented.current) {
      hasPresented.current = false;
      ref.current?.dismiss();
    }
  }, [visible]);

  const renderBackdrop = React.useCallback(
    (props: BottomSheetBackdropProps) => (
      // Defaults assume multiple snap points (backdrop appears past index 1);
      // our sheets are single dynamically-sized detents, so index 0 IS open.
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    [],
  );

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        background: { backgroundColor: colors.surface.low, borderRadius: 0 },
        handle: { backgroundColor: colors.surface.low, borderRadius: 0 },
        handleIndicator: { backgroundColor: colors.surface.highest, width: 40, height: 4, borderRadius: 0 },
        fill: { flex: 1 },
      }),
    [colors],
  );

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing={fixedHeightRatio == null}
      snapPoints={fixedHeightRatio != null ? [`${fixedHeightRatio * 100}%`] : undefined}
      maxDynamicContentSize={
        maxHeightRatio != null ? Dimensions.get('window').height * maxHeightRatio : undefined
      }
      keyboardBehavior={keyboardBehavior}
      // The library default is 'none', which means the sheet stays wherever the
      // keyboard pushed it and never comes back down when the keyboard hides.
      keyboardBlurBehavior="restore"
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleStyle={styles.handle}
      handleIndicatorStyle={styles.handleIndicator}
      onDismiss={handleDismiss}
    >
      {/* A fixed-height sheet needs a flex box for its children to size
          against; a dynamically-sized one must let the scrollable report its
          own content height, so it gets no wrapper at all. */}
      {scrollable ? (
        fixedHeightRatio != null ? <View style={styles.fill}>{children}</View> : children
      ) : (
        <BottomSheetView>{children}</BottomSheetView>
      )}
    </BottomSheetModal>
  );
}
