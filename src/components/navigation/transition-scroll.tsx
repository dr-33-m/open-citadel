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
import type { FlatList, ScrollView } from 'react-native';
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
