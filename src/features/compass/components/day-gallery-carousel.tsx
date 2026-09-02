import React from 'react';
import { Dimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

// The real one from `react-native-worklets`, not a hand-rolled wrapper around
// `runOnJS`. A plain JS helper is a Remote Function to the UI runtime, so
// calling it from inside a gesture callback throws "Tried to synchronously
// call a Remote Function" — this one is built to be invoked from a worklet.
import { scheduleOnRN } from 'react-native-worklets';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** One card, inset so the neighbours show at both edges. */
export const ITEM_WIDTH = Math.round(SCREEN_WIDTH * 0.82);
export const ITEM_SPACING = 12;

/**
 * How far a flick is projected before it is rounded to a card.
 *
 * The registry's own number. Dividing velocity by 1000 turns points-per-second
 * into roughly "cards this throw was going to travel", so a gentle swipe moves
 * one and a hard one moves several — which is the difference between a control
 * that feels weighted and one that teleports.
 */
const VELOCITY_PROJECTION = 1000;

/**
 * Slow enough to read. The default spring settles in about a fifth of a second,
 * which on a card carrying a day's worth of text arrives before the eye does.
 */
const SETTLE: Parameters<typeof withSpring>[1] = {
  damping: 20,
  stiffness: 90,
  mass: 1,
};

/**
 * How many cards either side of the centre are actually built.
 *
 * A month is thirty-one days and every one of them was being mounted the
 * moment the dialog opened — thirty-one cards, each sorting its activities and
 * laying out its rows, for the three that can be seen. The opacity ramp already
 * reaches zero at a distance of 2, so anything past that was invisible work.
 *
 * The window follows the ANIMATED index rather than the committed one, so a
 * flick that projects several days ahead mounts what it is flying towards
 * while it travels, instead of arriving at a gap.
 */
const WINDOW = 2;

type DayGalleryCarouselProps = {
  count: number;
  /** The card that should be centred. Driven from outside so the grid agrees. */
  index: number;
  onIndexChange: (index: number) => void;
  height: number;
  renderItem: (index: number) => React.ReactNode;
};

/**
 * A run of cards, one centred and its neighbours falling away either side.
 *
 * Built on rnmotion's gallery-stack carousel rather than the vendored
 * `Carousel`: that one settles with a short spring and no velocity projection,
 * so a flick jumped several days at once and landed before you could read where
 * you were. Here the pan tracks the finger, the release is projected from its
 * velocity and only then rounded, and the settle is slow enough to follow.
 *
 * The behaviours the source calls load-bearing are kept: cards are absolutely
 * positioned, `zIndex` is static at `count - index`, velocity is projected
 * before rounding, and shared values are read with `.get()` / `.set()`.
 */
export function DayGalleryCarousel({
  count,
  index,
  onIndexChange,
  height,
  renderItem,
}: DayGalleryCarouselProps) {
  const activeIndex = useSharedValue(index);
  const startIndex = useSharedValue(index);

  // Which cards are worth building right now. Driven off the UI thread's own
  // value and only when it crosses to a new whole card, so a drag does not
  // set React state on every frame of itself.
  const [centre, setCentre] = React.useState(index);
  useAnimatedReaction(
    () => Math.round(activeIndex.get()),
    (current, previous) => {
      if (current !== previous) scheduleOnRN(setCentre, current);
    },
  );

  // The grid can move the selection too (tapping a day), so the animated value
  // follows the prop whenever the two disagree.
  React.useEffect(() => {
    if (Math.round(activeIndex.get()) !== index) {
      activeIndex.set(withSpring(index, SETTLE));
    }
  }, [index, activeIndex]);

  const pan = Gesture.Pan()
    // Horizontal only, and it gives up the moment the drag is vertical — the
    // sheet underneath still needs its own gesture.
    .activeOffsetX([-10, 10])
    .failOffsetY([-12, 12])
    .onStart(() => {
      startIndex.set(activeIndex.get());
    })
    .onUpdate((e) => {
      const next = startIndex.get() - e.translationX / (ITEM_WIDTH + ITEM_SPACING);
      activeIndex.set(Math.max(0, Math.min(count - 1, next)));
    })
    .onEnd((e) => {
      const projected = activeIndex.get() - e.velocityX / VELOCITY_PROJECTION;
      const target = Math.max(0, Math.min(count - 1, Math.round(projected)));
      activeIndex.set(withSpring(target, SETTLE));
      scheduleOnRN(onIndexChange, target);
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={{ height, width: SCREEN_WIDTH }}>
        {Array.from({ length: count }, (_, i) =>
          Math.abs(i - centre) > WINDOW ? null : (
            <DayGalleryCard key={i} index={i} activeIndex={activeIndex} count={count}>
              {renderItem(i)}
            </DayGalleryCard>
          ),
        )}
      </View>
    </GestureDetector>
  );
}

function DayGalleryCard({
  index,
  activeIndex,
  count,
  children,
}: {
  index: number;
  activeIndex: SharedValue<number>;
  count: number;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const diff = index - activeIndex.get();
    const centeredX =
      SCREEN_WIDTH / 2 - ITEM_WIDTH / 2 + diff * (ITEM_WIDTH + ITEM_SPACING);
    const scale = interpolate(
      Math.abs(diff),
      [0, 1],
      [1, 0.9],
      Extrapolation.CLAMP,
    );
    return {
      transform: [{ translateX: centeredX }, { scale }],
      // Static, as the source requires: the card nearest the front of the list
      // is drawn on top and never re-sorts mid-gesture.
      zIndex: count - index,
      opacity: interpolate(Math.abs(diff), [0, 1, 2], [1, 0.7, 0], Extrapolation.CLAMP),
    };
  });

  return (
    <Animated.View style={[{ position: 'absolute', width: ITEM_WIDTH }, style]}>
      {children}
    </Animated.View>
  );
}
