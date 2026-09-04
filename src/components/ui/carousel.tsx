/**
 * Carousel — a run of slides, one at a time, dragged with a finger.
 *
 * ```tsx
 * <Carousel loop>
 *   <Carousel.Content className="h-56">
 *     {photos.map((photo) => (
 *       <Carousel.Item key={photo.id}>
 *         <Image source={{ uri: photo.uri }} className="h-full w-full" />
 *       </Carousel.Item>
 *     ))}
 *   </Carousel.Content>
 *   <Carousel.Controls />
 * </Carousel>
 * ```
 *
 * ## One shared value, four layouts
 *
 * Everything is driven from a single `progress` — the position in the run, as a
 * fractional index. `2.4` is two-fifths of the way from the third slide to the
 * fourth, and every slide styles itself from its own distance to that number.
 * A pan writes to it, a spring settles it onto a whole number, and the dots
 * read it.
 *
 * That is why the track is a pan gesture rather than a paging `ScrollView`. A
 * scroll view carries its offset natively and would serve `default` well
 * enough, but `coverflow` and `stack` do not lay their slides along a track at
 * all — they hold them in one place and pull them apart with transforms — so
 * there would be nothing for it to scroll. One mechanism all four read beats a
 * native scroller for one of them and something else for the rest.
 *
 * ## What each layout is for
 *
 * - **`default`** — a track. The honest choice for content that is read rather
 *   than admired: a row of cards, a gallery, an onboarding run.
 * - **`interactive`** — the run fans out around the middle slide and tilts away
 *   on both sides, opening wider while a finger is down. For a small set worth
 *   showing off.
 * - **`coverflow`** — the neighbours turn away from you in perspective. Best
 *   with art: covers, posters, photographs.
 * - **`stack`** — a deck. The active card is on top with the next two peeking
 *   out behind it, and dragging takes the top one away. For cards dealt with
 *   one at a time, where the pile is the point.
 *
 * Depth is carried by scale, opacity and z-order rather than by moving slides
 * along z: React Native's transform has `perspective` and `rotateY` but no
 * `translateZ`, so a slide is made to *look* further away rather than put there.
 */
import {
  Children,
  createContext,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, View, type LayoutChangeEvent, type ViewProps } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/ui/icons';
import { useControllableState } from '@/components/ui/controllable-state';
import { Text, textChildren } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import {
  normalizeCarouselIndex,
  useCarouselAutoplay,
  useCarouselIndexLifecycle,
} from '@/components/ui/carousel-lifecycle';

/** Settles the run onto a whole index. Tuned to stop rather than to bounce. */
const SPRING = { damping: 22, stiffness: 190, mass: 0.55 } as const;

/**
 * Fraction of a slide that has to be dragged past for the move to count, and
 * the velocity that carries it there regardless. Together they are what lets a
 * short fast flick and a long slow drag both advance exactly one slide.
 */
const SNAP_FRACTION = 0.28;
const SNAP_VELOCITY = 500;

/** How far past the ends the run may be pulled when it does not loop. */
const OVERSCROLL = 0.4;
/** Fraction of the finger's travel that lands past an end. */
const RUBBER = 0.35;

/** Slides either side of the active one that `coverflow` still draws. */
const COVERFLOW_DEPTH = 2;

/**
 * Gap between coverflow's slides, as a fraction of one slide's length.
 *
 * Proportional rather than a fixed number of points: the neighbours have to
 * clear the middle slide by enough to be read as separate cards, and how much
 * that is depends entirely on how wide the cards are.
 */
const COVERFLOW_SPREAD = 0.55;

/** Cards behind the top one in `stack`. Two is a pile; five is a mess. */
const STACK_DEPTH = 2;

export type CarouselVariant = 'default' | 'interactive' | 'coverflow' | 'stack';
export type CarouselOrientation = 'horizontal' | 'vertical';
export type CarouselAlign = 'start' | 'center';

interface CarouselContextValue {
  /** Position in the run as a fractional index. The whole component reads it. */
  progress: SharedValue<number>;
  /** 0 to 1 as a finger lands and lifts. Drives the resting and open states. */
  engaged: SharedValue<number>;
  count: number;
  setCount: (count: number) => void;
  /** Nearest whole index, in JS — a frame behind `progress`, by design. */
  index: number;
  scrollTo: (index: number) => void;
  next: () => void;
  previous: () => void;
  variant: CarouselVariant;
  orientation: CarouselOrientation;
  align: CarouselAlign;
  loop: boolean;
  itemSize: number;
}

const CarouselContext = createContext<CarouselContextValue | null>(null);

function useCarousel(component: string): CarouselContextValue {
  const context = useContext(CarouselContext);
  if (!context) {
    throw new Error(`${component} must be used within a <Carousel>`);
  }
  return context;
}

/**
 * A slide's own position in the run, handed down by `Content` rather than
 * counted up by each slide.
 *
 * The alternative is for a slide to register itself and be told its number
 * back, which works right up until one is inserted in the middle and every
 * slide after it is wrong until the next render settles.
 */
const ItemIndexContext = createContext(0);

/** Position and controls, for a control of your own outside the built-in ones. */
export function useCarouselState() {
  const { index, count, scrollTo, next, previous } = useCarousel('useCarouselState');
  return { index, count, scrollTo, next, previous };
}

/**
 * Wraps a fractional index into the run. A worklet because the pan needs it
 * per frame on the UI thread, and the imperative handle needs it in JS.
 */
function wrap(value: number, count: number) {
  'worklet';
  return normalizeCarouselIndex(value, count, true);
}

/**
 * Signed distance from a slide to the current position, taking the short way
 * round when the run loops.
 *
 * Without the wrap the last slide sits `count - 1` away from the first, and
 * every layout throws it off screen at the exact moment it should be sliding
 * in from the other side.
 */
function distance(index: number, progress: number, count: number, loop: boolean) {
  'worklet';
  const raw = index - progress;
  if (!loop || count <= 1) return raw;
  const half = count / 2;
  if (raw > half) return raw - count;
  if (raw < -half) return raw + count;
  return raw;
}

/** Drop the empty nodes React omits before assigning slide positions. */
function renderableChildren(children: ReactNode) {
  // React treats a Fragment as one child here. Keep that keyed boundary rather
  // than recursively flattening it and changing React's reconciliation model.
  return Children.toArray(children);
}

function renderableChildKey(child: ReactNode, index: number) {
  return isValidElement(child) && child.key !== null ? child.key : index;
}

export interface CarouselProps extends ViewProps {
  className?: string;
  /** How the slides are arranged, and how they move. */
  variant?: CarouselVariant;
  /** Which way the run travels. `stack` is always dealt sideways. */
  orientation?: CarouselOrientation;
  /** Run past the last slide back to the first, and the other way. */
  loop?: boolean;
  /**
   * Where the active slide sits. `center` is what the fanned layouts want;
   * `start` suits a row of cards running off the trailing edge. `coverflow`
   * and `stack` are always centred.
   */
  align?: CarouselAlign;
  /**
   * Length of one slide along the direction of travel, in points. Measured from
   * the carousel's own box when omitted, which is what a full-width slide
   * wants; set it for a run that shows more than one at a time.
   */
  itemSize?: number;
  /** Advance on a timer. Stops at the non-looping end or after the first touch. */
  autoplay?: boolean;
  /** Milliseconds each slide is held when `autoplay` is set. */
  autoplayInterval?: number;
  /**
   * Controlled active slide. Requests move visually only after this value changes;
   * an index invalidated by a child-count change is normalized and reported.
   */
  index?: number;
  /** Starting slide when uncontrolled. */
  defaultIndex?: number;
  onIndexChange?: (index: number) => void;
  /** Let go of the gesture, for a carousel inside something else that drags. */
  scrollEnabled?: boolean;
  children?: ReactNode;
}

/** Imperative handle, for driving the run from outside its own controls. */
export interface CarouselHandle {
  next: () => void;
  previous: () => void;
  scrollTo: (index: number) => void;
}

const CarouselRoot = forwardRef<CarouselHandle, CarouselProps>(function CarouselRoot(
  {
    className,
    variant = 'default',
    orientation = 'horizontal',
    loop = false,
    align = 'center',
    itemSize: itemSizeProp,
    autoplay = false,
    autoplayInterval = 4000,
    index: indexProp,
    defaultIndex = 0,
    onIndexChange,
    scrollEnabled = true,
    children,
    ...props
  },
  ref
) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [count, setCountValue] = useState(0);
  const [countKnown, setCountKnown] = useState(false);
  const [touched, setTouched] = useState(false);
  const reducedMotion = useReducedMotion();

  const {
    value: requestedIndex,
    setValue: setIndex,
    isControlled,
  } = useControllableState({
    value: indexProp,
    defaultValue: defaultIndex,
    onChange: onIndexChange,
  });

  const progress = useSharedValue(indexProp ?? defaultIndex);
  const engaged = useSharedValue(0);
  /*
   * LOCAL EDIT (Open Citadel): where the run was when the finger landed.
   *
   * A pan reports `translation` from the touch down, cumulatively — so the
   * position under the finger is (start - translation/itemSize), not
   * (wherever it is now - translation/itemSize). The registry's `onUpdate`
   * did the latter, which re-applies the whole travel to an already-moved
   * `progress` on every frame: the run advances by the SUM of the per-frame
   * offsets and outruns the finger several times over. Felt as a deck that
   * flies through three cards on a flick meant to take one.
   *
   * Re-apply after any `panelui-cli update carousel`.
   */
  const dragFrom = useSharedValue(0);

  // A deck is dealt from the top of a pile, so it is dragged sideways whatever
  // the run's own direction is — there is no track for it to travel along.
  const axis: CarouselOrientation = variant === 'stack' ? 'horizontal' : orientation;
  const along = axis === 'horizontal' ? size.width : size.height;
  const itemSize = itemSizeProp ?? along ?? 0;

  const setCount = useCallback((next: number) => {
    setCountValue(next);
    setCountKnown(true);
  }, []);

  /*
   * The slide the run is currently travelling to.
   *
   * Moving the run and recording where it went are two steps: `scrollTo` starts
   * the spring, then the new index arrives back through state and the lifecycle
   * effect asks for it again. Without this the second ask restarts the spring a
   * frame into the first — from a standstill, so a flick loses the momentum it
   * was carrying. Remembering the target lets the echo be recognised and
   * ignored, while a genuine request for the same slide still animates, because
   * that one comes through `scrollTo` and sets this first.
   */
  const animatedTarget = useRef<number | null>(null);

  const animateTo = useCallback(
    (target: number) => {
      animatedTarget.current = target;
      if (reducedMotion) {
        progress.value = target;
      } else if (loop) {
        // Spring to the nearest representation of the target rather than to the
        // target itself, so a wrap from the last slide to the first travels one
        // step forward instead of winding all the way back through the run.
        const shortest = progress.value + distance(target, progress.value, count, true);
        progress.value = withSpring(shortest, SPRING, (finished) => {
          if (finished) progress.value = wrap(progress.value, count);
        });
      } else {
        progress.value = withSpring(target, SPRING);
      }
    },
    [count, loop, progress, reducedMotion]
  );

  const settleIndex = useCallback(
    (next: number) => {
      if (animatedTarget.current === next) return;
      if (Math.abs(progress.value - next) >= 0.001) animateTo(next);
    },
    [animateTo, progress]
  );

  const index = useCarouselIndexLifecycle({
    requestedIndex,
    count,
    countKnown,
    loop,
    onCorrection: setIndex,
    onSettledIndex: settleIndex,
  });

  const scrollTo = useCallback(
    (target: number) => {
      if (count <= 0) return;
      const settled = normalizeCarouselIndex(target, count, loop);

      // A controlled request belongs to its owner. The finger may move the run,
      // but after release it returns to the current prop until the owner accepts
      // the request by changing that prop.
      animateTo(isControlled ? index : settled);
      setIndex(settled);
    },
    [animateTo, count, index, isControlled, loop, setIndex]
  );

  const next = useCallback(() => scrollTo(index + 1), [index, scrollTo]);
  const previous = useCallback(() => scrollTo(index - 1), [index, scrollTo]);

  useImperativeHandle(ref, () => ({ next, previous, scrollTo }), [next, previous, scrollTo]);

  /*
   * Autoplay stops for good the first time a finger lands, rather than pausing.
   * Someone who has taken hold of the run is reading it, and having it start
   * moving again a few seconds later is the behaviour everybody hates.
   */
  useCarouselAutoplay({
    enabled: autoplay && !touched,
    index,
    count,
    loop,
    interval: autoplayInterval,
    onAdvance: scrollTo,
  });

  const settle = useCallback(
    (target: number) => {
      setTouched(true);
      scrollTo(target);
    },
    [scrollTo]
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(scrollEnabled && count > 1 && itemSize > 0)
        // A carousel inside a scroll view has to let the cross-axis drags
        // through, or the two fight over every diagonal.
        .activeOffsetX(axis === 'horizontal' ? [-10, 10] : [-10000, 10000])
        .activeOffsetY(axis === 'horizontal' ? [-10000, 10000] : [-10, 10])
        .onBegin(() => {
          // Read before the first update, and before any spring still settling
          // from the last flick has anywhere left to go — assigning `progress`
          // below cancels it, so this is where the run actually starts from.
          dragFrom.value = progress.value;
          engaged.value = withTiming(1, { duration: 160 });
        })
        .onUpdate((event) => {
          const moved = axis === 'horizontal' ? event.translationX : event.translationY;
          const raw = dragFrom.value - moved / itemSize;
          if (loop) {
            progress.value = raw;
            return;
          }
          // Off the ends the run follows the finger at a fraction of the
          // distance, so the edge is felt rather than hit.
          const last = count - 1;
          progress.value =
            raw < 0
              ? Math.max(-OVERSCROLL, raw * RUBBER)
              : raw > last
                ? Math.min(last + OVERSCROLL, last + (raw - last) * RUBBER)
                : raw;
        })
        .onEnd((event) => {
          const velocity = axis === 'horizontal' ? event.velocityX : event.velocityY;
          const moved = axis === 'horizontal' ? event.translationX : event.translationY;

          // The slide it started on, not the one it is nearest now: rounding
          // the current position would let a slow drag that never reached the
          // threshold still count as a move. Taken from where the finger
          // landed rather than reconstructed by adding the travel back on,
          // which the rubber band at the ends makes inexact.
          const from = Math.round(dragFrom.value);
          const past = Math.abs(moved) / itemSize > SNAP_FRACTION;
          const flicked = Math.abs(velocity) > SNAP_VELOCITY;
          const step = past || flicked ? (moved < 0 ? 1 : -1) : 0;

          runOnJS(settle)(from + step);
        })
        .onFinalize(() => {
          engaged.value = withTiming(0, { duration: 220 });
        }),
    [scrollEnabled, count, itemSize, axis, engaged, progress, dragFrom, loop, settle]
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) =>
      Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1
        ? current
        : { width, height }
    );
    props.onLayout?.(event);
  };

  const context = useMemo(
    () => ({
      progress,
      engaged,
      count,
      setCount,
      index,
      scrollTo: settle,
      next,
      previous,
      variant,
      orientation: axis,
      align,
      loop,
      itemSize,
    }),
    [progress, engaged, count, index, settle, next, previous, variant, axis, align, loop, itemSize]
  );

  return (
    <CarouselContext.Provider value={context}>
      <GestureDetector gesture={pan}>
        <View
          accessibilityRole="list"
          {...props}
          onLayout={onLayout}
          className={cn('w-full', className)}
        >
          {textChildren(children)}
        </View>
      </GestureDetector>
    </CarouselContext.Provider>
  );
});
CarouselRoot.displayName = 'Carousel';

/* -------------------------------------------------------------------------- */
/* Track                                                                      */
/* -------------------------------------------------------------------------- */

export interface CarouselContentProps extends ViewProps {
  className?: string;
  children?: ReactNode;
}

/**
 * The box the slides live in. Give it a height — nothing inside it is in the
 * layout flow, so it has no height of its own to take.
 *
 * It does not move. Every slide places itself from `progress`, which is what
 * lets `default` and `coverflow` be one component with different arithmetic
 * rather than two different trees. The alignment here is the *resting* place
 * every slide is offset from.
 */
function CarouselContent({ className, children, ...props }: CarouselContentProps) {
  const { setCount, variant, orientation, align } = useCarousel('Carousel.Content');
  const slides = renderableChildren(children);
  const horizontal = orientation === 'horizontal';
  const centred = align === 'center' || variant === 'coverflow' || variant === 'stack';

  useEffect(() => {
    setCount(slides.length);
  }, [setCount, slides.length]);

  return (
    <View
      {...props}
      className={cn(
        'w-full overflow-hidden',
        // Absolutely positioned children with no insets still take the
        // parent's alignment in Yoga, which is what puts a slide at rest.
        horizontal
          ? cn('justify-center', centred ? 'items-center' : 'items-start')
          : cn('items-center', centred ? 'justify-center' : 'justify-start'),
        className
      )}
      style={[
        // `perspective` on the container is what makes coverflow's rotation
        // read as depth rather than as a squash.
        variant === 'coverflow' ? { transform: [{ perspective: 1000 }] } : null,
        props.style,
      ]}
    >
      {slides.map((child, index) => (
        <ItemIndexContext.Provider key={renderableChildKey(child, index)} value={index}>
          {child}
        </ItemIndexContext.Provider>
      ))}
    </View>
  );
}

export interface CarouselItemProps extends ViewProps {
  className?: string;
  children?: ReactNode;
}

/** One slide. Its transform is whatever the root's `variant` asks for. */
function CarouselItem({ className, children, style, ...props }: CarouselItemProps) {
  const { progress, engaged, count, index: active, variant, orientation, loop, itemSize } =
    useCarousel('Carousel.Item');
  const index = useContext(ItemIndexContext);
  const horizontal = orientation === 'horizontal';

  /*
   * In the layouts that pile slides on top of each other, only the one on top
   * takes touches.
   *
   * `zIndex` reorders what is *drawn* but, on iOS, not what is *hit*: hit
   * testing walks the subviews in the order they were added, so the last slide
   * rendered sits in front of every gesture regardless of its z-order — and in
   * a deck that slide is the one at the bottom of the pile, drawn at zero
   * opacity. An invisible card was swallowing every drag.
   */
  const stacked = variant === 'coverflow' || variant === 'stack';
  const inert = stacked && index !== active;

  const animated = useAnimatedStyle(() => {
    const d = distance(index, progress.value, count, loop);
    const a = Math.abs(d);

    if (variant === 'coverflow') {
      return {
        opacity: a > COVERFLOW_DEPTH ? 0 : Math.max(0, 1 - a * 0.25),
        zIndex: Math.round(100 - a * 10),
        transform: [
          { perspective: 1000 },
          { translateX: d * itemSize * COVERFLOW_SPREAD },
          // Turned away from the middle and back towards it as it arrives.
          // Interpolated rather than switched, or a slide would snap flat.
          { rotateY: `${interpolate(d, [-1, 0, 1], [38, 0, -38], Extrapolation.CLAMP)}deg` },
          { scale: interpolate(a, [0, 1], [1.1, 0.92], Extrapolation.CLAMP) },
        ],
      };
    }

    if (variant === 'stack') {
      // The pile behind the top card is stepped, not spread: each card back is
      // a little smaller and a little lower. Only the top one is dragged, and
      // it leaves sideways with a tilt.
      const behind = Math.min(Math.max(0, d), STACK_DEPTH);
      const leaving = Math.min(0, d);
      return {
        opacity: d < -1 || d > STACK_DEPTH ? 0 : 1,
        zIndex: Math.round(100 - Math.max(0, d) * 10),
        transform: [
          { translateX: leaving * itemSize * 1.15 },
          // LOCAL EDIT (Open Citadel): step 26/0.04 rather than the registry's
          // 14/0.06. Those two numbers fight each other — the scale pulls the
          // card behind UP by half the height it loses, so on a tall card
          // (our log deck is 340) the 14pt drop nets out to about four visible
          // points and the pile reads as a single card. A bigger step with a
          // gentler shrink leaves roughly 19pt of each card behind on show,
          // which is what makes it look like a deck you are working through.
          // Re-apply after any `panelui-cli update carousel`.
          { translateY: behind * 26 },
          { rotate: `${leaving * 12}deg` },
          { scale: 1 - behind * 0.04 },
        ],
      };
    }

    if (variant === 'interactive') {
      /*
       * Two states blended by `engaged`, rather than switched between: at rest
       * the run is a tidy fan, and it opens wider under a finger. Blended, so
       * taking hold of it opens it; switched, it would jump open.
       */
      const open = engaged.value;
      const spread = d * itemSize;
      const lift = d * 24 * open;
      const inactive = 0.78 - open * 0.15;
      return {
        opacity: a > 3 ? 0 : 1,
        zIndex: Math.round(100 - a * 10),
        transform: [
          { translateX: horizontal ? spread : lift },
          { translateY: horizontal ? lift : spread },
          { rotate: `${d * (5 + open * 15)}deg` },
          /*
           * The slide in the middle rests at exactly 1, and the fan's depth
           * comes from the others shrinking rather than from it growing.
           *
           * Scaling it up instead is what made its caption soft. Text is
           * rasterised at its layout size and then scaled by the compositor,
           * so a label on a slide held at 1.05 is drawn at the wrong raster
           * size for as long as it is the active one — which is the whole time
           * it is readable, since every other caption has faded out.
           */
          { scale: interpolate(a, [0, 1], [1, inactive], Extrapolation.CLAMP) },
        ],
      };
    }

    // `default` — a plain track, each slide one length from the last.
    return {
      transform: [
        { translateX: horizontal ? d * itemSize : 0 },
        { translateY: horizontal ? 0 : d * itemSize },
      ],
    };
  });

  // `coverflow` and `stack` are sized by whatever is put in them: they are
  // built around a card, and a card that had to be the width of the screen
  // would have nothing to stack behind.
  const sized = variant === 'default' || variant === 'interactive';

  return (
    <Animated.View
      {...props}
      style={[
        { position: 'absolute', pointerEvents: inert ? 'none' : 'auto' },
        sized ? (horizontal ? { width: itemSize } : { height: itemSize }) : null,
        sized && variant === 'default'
          ? horizontal
            ? { height: '100%' }
            : { width: '100%' }
          : null,
        animated,
        style,
      ]}
      className={cn(className)}
    >
      {textChildren(children)}
    </Animated.View>
  );
}

/* -------------------------------------------------------------------------- */
/* Controls                                                                   */
/* -------------------------------------------------------------------------- */

export interface CarouselCaptionProps extends ViewProps {
  className?: string;
  children?: ReactNode;
}

/**
 * A slide's label, shown only while that slide is the active one.
 *
 * It lives inside the slide rather than beside the run, so it travels with what
 * it names — a caption that stays put while the picture moves belongs to the
 * carousel rather than to the picture.
 */
function CarouselCaption({ className, children, ...props }: CarouselCaptionProps) {
  const { progress, count, loop } = useCarousel('Carousel.Caption');
  const index = useContext(ItemIndexContext);

  /*
   * Gone well before the next slide arrives, rather than fading across the
   * whole step. The layouts that use a caption overlap their slides, so a
   * caption still at a third of its opacity halfway through a drag is a line
   * of grey text sitting on top of the neighbouring picture — which reads as a
   * rendering fault rather than as a transition.
   */
  /*
   * Opacity only. A scale here would compound with the slide's own — the
   * caption is inside it — and the text would be resampled twice, once for
   * each. The slide already carries all the movement this needs to read as
   * belonging to the picture.
   */
  const animated = useAnimatedStyle(() => {
    const a = Math.abs(distance(index, progress.value, count, loop));
    return { opacity: interpolate(a, [0, 0.3], [1, 0], Extrapolation.CLAMP) };
  });

  return (
    <Animated.View {...props} style={[animated, props.style]} className={cn(className)}>
      {textChildren(children, (text) => (
        <Text size="xs" weight="semibold" className="text-center">
          {text}
        </Text>
      ))}
    </Animated.View>
  );
}

export interface CarouselDotsProps extends ViewProps {
  className?: string;
  /** Lay the dots down the side instead of across. */
  orientation?: CarouselOrientation;
  /** Jump to a slide by tapping its dot. */
  interactive?: boolean;
}

/**
 * One dot per slide, the active one drawn as a bar.
 *
 * Length rather than colour alone carries the position: a row that differs only
 * in opacity is unreadable at a glance, and invisible to anyone who cannot
 * separate the two greys.
 */
function CarouselDots({
  className,
  orientation = 'horizontal',
  interactive = true,
  ...props
}: CarouselDotsProps) {
  const { count, index, scrollTo } = useCarousel('Carousel.Dots');
  const horizontal = orientation === 'horizontal';
  if (count <= 1) return null;

  return (
    <View
      accessibilityRole="tablist"
      {...props}
      className={cn('items-center gap-1', horizontal ? 'flex-row' : 'flex-col', className)}
    >
      {Array.from({ length: count }, (_unused, dot) => {
        const active = dot === index;
        return (
          <Pressable
            key={dot}
            disabled={!interactive}
            onPress={() => scrollTo(dot)}
            accessibilityRole="tab"
            accessibilityLabel={`Slide ${dot + 1} of ${count}`}
            accessibilityState={{ selected: active }}
            // 24, not the 48 the buttons get. Dots sit a few points apart, so
            // a 48 box would either overlap its neighbours — making a tap near
            // the join land on the wrong slide — or push a five-slide run out
            // to the width of the screen. 24 clears the minimum with the pitch
            // still wider than the target, so no two dots contend for a touch.
            className={cn('items-center justify-center', interactive && 'h-6 w-6')}
          >
            <View
              className={cn(
                'rounded-full',
                horizontal
                  ? active
                    ? 'h-1 w-4'
                    : 'h-1 w-1'
                  : active
                    ? 'h-4 w-1'
                    : 'h-1 w-1',
                active ? 'bg-foreground' : 'bg-foreground/30'
              )}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

export interface CarouselArrowProps extends ViewProps {
  className?: string;
  children?: ReactNode;
}

/** Body of the two arrows — they differ only in icon, label and direction. */
function makeArrow(direction: 'previous' | 'next') {
  const name = direction === 'next' ? 'Next' : 'Previous';

  function Arrow({ className, children, ...props }: CarouselArrowProps) {
    const { count, index, loop, next, previous } = useCarousel(`Carousel.${name}`);
    // Without a loop the ends are dead. An arrow that stays live and does
    // nothing is worse than one that says it cannot.
    const disabled = !loop && (direction === 'next' ? index >= count - 1 : index <= 0);

    return (
      <Pressable
        {...props}
        disabled={disabled}
        onPress={direction === 'next' ? next : previous}
        accessibilityRole="button"
        accessibilityLabel={direction === 'next' ? 'Next slide' : 'Previous slide'}
        accessibilityState={{ disabled }}
        className={cn(
          'h-12 w-12 items-center justify-center rounded-full',
          disabled ? 'opacity-30' : 'active:bg-foreground/10',
          className
        )}
      >
        {children ??
          (direction === 'next' ? (
            <ChevronRightIcon size={14} />
          ) : (
            <ChevronLeftIcon size={14} />
          ))}
      </Pressable>
    );
  }
  Arrow.displayName = `Carousel.${name}`;
  return Arrow;
}

const CarouselPrevious = makeArrow('previous');
const CarouselNext = makeArrow('next');

export interface CarouselControlsProps extends ViewProps {
  className?: string;
}

/**
 * The arrows and the dots in one pill.
 *
 * Together rather than scattered, because they answer the same question — where
 * am I in this, and how do I move — and a bar that reads as one object can sit
 * over the content instead of taking a strip of the layout for itself.
 */
function CarouselControls({ className, ...props }: CarouselControlsProps) {
  return (
    <View
      {...props}
      className={cn(
        'flex-row items-center justify-center gap-2 self-center rounded-full border border-border bg-background/80 px-1.5 py-0.5',
        className
      )}
    >
      <CarouselPrevious />
      <CarouselDots />
      <CarouselNext />
    </View>
  );
}

export const Carousel = Object.assign(CarouselRoot, {
  Content: CarouselContent,
  Item: CarouselItem,
  Caption: CarouselCaption,
  Dots: CarouselDots,
  Previous: CarouselPrevious,
  Next: CarouselNext,
  Controls: CarouselControls,
});
