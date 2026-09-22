import { useRef, useState, type ComponentRef } from "react";
import type { LayoutChangeEvent } from "react-native";
import type { ScrollView as GestureScrollView } from "react-native-gesture-handler";
import {
  cancelAnimation,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { easing } from "@/constants/theme";

type NotesScroll = ComponentRef<typeof GestureScrollView>;

/** Longer than a tap's feedback: this carries the eye a whole note's height. */
const FOLLOW_MS = 420;

/**
 * Brings a note just added into view, with its top edge at the top of the box.
 *
 * Top, not the end of the list: scrolled to the bottom, a note longer than the
 * box opened on its last line. Where the note is too short to reach the top
 * (it is the last one, so nothing sits under it), the box stops at its end
 * instead of scrolling past it.
 *
 * Driven on the UI thread so it can take the app's curve, decelerating into
 * the note. A native animated `scrollTo` has one fixed curve. A drag takes
 * over at once, and reduce motion jumps straight there.
 *
 * "Added" is a note id this box has not drawn before, so an edit or a delete
 * never moves it, and neither does opening the sheet.
 */
export function useScrollToNewNote(noteIds: string[]) {
  const scrollRef = useAnimatedRef<NotesScroll>();
  const reducedMotion = useReducedMotion();
  // Read and written only in layout handlers, never drawn from, so a mutable
  // set is enough; state just gives it a lazy start with the notes on show.
  const [seen] = useState(() => new Set(noteIds));
  const viewport = useRef(0);

  const offset = useSharedValue(0);
  const target = useSharedValue(0);
  const following = useSharedValue(false);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      offset.value = event.contentOffset.y;
    },
    onBeginDrag: () => {
      following.value = false;
      cancelAnimation(target);
    },
  });

  useAnimatedReaction(
    () => target.value,
    (y) => {
      if (following.value) scrollTo(scrollRef, 0, y, false);
    },
  );

  const onLayout = (event: LayoutChangeEvent) => {
    viewport.current = event.nativeEvent.layout.height;
  };

  const onNoteLayout = (id: string) => (event: LayoutChangeEvent) => {
    if (seen.has(id)) return;
    seen.add(id);

    const { y, height } = event.nativeEvent.layout;
    const to = Math.max(0, Math.min(y, y + height - viewport.current));
    following.value = true;
    target.value = offset.value;
    target.value = reducedMotion
      ? to
      : withTiming(to, { duration: FOLLOW_MS, easing }, () => {
          following.value = false;
        });
  };

  return { scrollRef, onScroll, onLayout, onNoteLayout };
}
