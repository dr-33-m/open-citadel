/**
 * Scroll containers that the navigator can negotiate with.
 *
 * A drawer closes with a downward drag, and a drawer is a screen full of
 * scrollable content — so the two gestures are the same movement, and one of
 * them has to yield. The old answer was to confine the close to a 96dp strip
 * of chrome at the top, which kept them apart but made the gesture something
 * you had to know about and aim for: everywhere the content actually is, a
 * drag down scrolled and nothing else.
 *
 * These are the same `ScrollView`/`FlatList`, wrapped so the navigator can
 * read their scroll offset on the UI thread. With that, the rule the platform
 * itself uses applies: while there is content above, a downward drag scrolls;
 * once the list is at its top, the next downward drag closes the screen. The
 * drag is available over the whole screen because the scroll position — not a
 * region of the screen — is what decides who owns it.
 *
 * Any scrollable screen configured with `drawerTransition` must scroll through
 * one of these. Without the offset the navigator assumes there is nothing to
 * scroll and takes every downward drag, which reads as the screen closing when
 * the user meant to scroll.
 */
import { FlashList } from '@shopify/flash-list';
import React, { forwardRef } from 'react';
import { ScrollView, type FlatList, type ScrollViewProps } from 'react-native';
import Transition from 'react-native-screen-transitions';

/*
 * Both are the plain React Native components with a scroll listener attached,
 * so they take exactly the props those components take — but the library
 * rebuilds its wrappers' prop types from scratch, which drops two things the
 * app relies on: Uniwind's `className` (declared by augmenting `ViewProps`,
 * which the rebuilt type does not extend) and `FlatList`'s item generic,
 * without which every `renderItem` argument is `unknown`. Restating the
 * original component types is what keeps call sites honest; the alternative
 * is untyped props at every use.
 */

/** `ScrollView`, with its offset reported to the navigator. */
export const TransitionScrollView = Transition.ScrollView as unknown as typeof ScrollView;

/** `FlatList`, with its offset reported to the navigator. */
export const TransitionFlatList = Transition.FlatList as unknown as typeof FlatList;

type ListScrollProps = ScrollViewProps & { onListScroll?: ScrollViewProps['onScroll'] };

/*
 * The ScrollView inside a FlashList. FlashList's own `onScroll` is a plain JS
 * function (it is how the list recycles cells), and the transition wrapper
 * composes only worklet handlers, so handed over as `onScroll` it would be
 * dropped. It travels as `onListScroll` instead, past the wrapper, and joins
 * the ScrollView's `onScroll` here.
 */
const ListScrollView = forwardRef<ScrollView, ListScrollProps>(function ListScrollView(
  { onListScroll, onScroll, ...props },
  ref,
) {
  const handleScroll: ScrollViewProps['onScroll'] = (event) => {
    onScroll?.(event);
    onListScroll?.(event);
  };
  return <ScrollView {...props} ref={ref} onScroll={handleScroll} />;
});

const TransitionListScrollView = Transition.createTransitionAwareComponent(ListScrollView, {
  isScrollable: true,
}) as unknown as typeof ListScrollView;

const FlashListScroller = forwardRef<ScrollView, ScrollViewProps>(function FlashListScroller(
  { onScroll, ...props },
  ref,
) {
  return <TransitionListScrollView {...props} ref={ref} onListScroll={onScroll} />;
});

/**
 * `FlashList`, with its offset reported to the navigator.
 *
 * The transition wrapper goes on FlashList's ScrollView, not on the list.
 * Wrapping the list put the navigator's scroll gesture on the plain View that
 * FlashList draws around its ScrollView, so the drawer's drag and the scroll
 * were never coordinated and the list would not scroll at all.
 */
export const TransitionFlashList = forwardRef(function TransitionFlashList(
  props: React.ComponentProps<typeof FlashList>,
  ref: React.ForwardedRef<React.ComponentRef<typeof FlashList>>,
) {
  return <FlashList {...props} ref={ref} renderScrollComponent={FlashListScroller} />;
}) as unknown as typeof FlashList;
