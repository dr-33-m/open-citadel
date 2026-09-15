/**
 * RingChart — progress towards several targets, as concentric arcs.
 *
 * ```tsx
 * <RingChart data={goals}>
 *   <RingChart.Header title="Today" value="486 kcal" legend />
 *   <RingChart.Ring index={0} />
 *   <RingChart.Ring index={1} />
 *   <RingChart.Center />
 * </RingChart>
 * ```
 *
 * ## What it is not
 *
 * It is not a pie or a donut, and the difference matters. A pie divides one
 * whole between its slices, so its parts are only meaningful against each
 * other and the angles must add to a full turn. A ring here is a value against
 * *its own* target — three rings can all be at ninety percent of three
 * unrelated numbers, and that is the reading. Nothing is normalised across
 * rings, and nothing has to add up.
 *
 * That is also why each ring gets a track. An arc drawn on nothing shows how
 * far something went; an arc drawn on a full circle shows how far it went *of
 * what it was aiming at*, which is the entire question.
 *
 * ## Drawing
 *
 * Each ring is two arcs — a track and the progress over it — with only the
 * progress animated, through `strokeDasharray`. Sweeping the arc by rebuilding
 * its path would work, but a dash offset is two numbers moving on an unchanged
 * path, and it keeps the rounded cap pinned to the moving end for free.
 *
 * The same dash pattern is what makes the other two shapes possible without any
 * more geometry. An open gauge is the pattern cut short of the circumference
 * and the whole circle turned to put the gap where it is wanted; a segmented
 * ring is the pattern repeated, one pair per tick. Both stay one `Circle`.
 *
 * Touch, not hover: a ring is selected by pressing it, and pressing the same
 * one again clears the selection. There is no equivalent of a pointer resting
 * somewhere without committing, so a chart that only revealed its numbers on
 * hover would never reveal them at all.
 */
import {
  Children,
  createContext,
  forwardRef,
  isValidElement,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, View, type LayoutChangeEvent, type ViewProps } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';
import { Text } from '@/components/ui/text';
import { compactNumber, useSeriesColor, type SeriesColorIndex } from '@/lib/chart';
import { cn } from '@/lib/cn';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Where a child is drawn. Rings go inside the SVG, the header above it, and
 * everything else over it as ordinary views.
 */
type Slot = 'ring' | 'overlay' | 'header';

/** One ring per datum, and the datum is the whole of its contract. */
export interface RingDatum {
  /** Name for the legend and the centre readout. */
  label: string;
  /** Where this ring has got to. */
  value: number;
  /** What it is aiming at. The ring is full when `value` reaches it. */
  maxValue: number;
  /** Explicit colour, overriding the `--color-chart-*` token. */
  color?: string;
}

interface RingChartContextValue {
  data: RingDatum[];
  size: number;
  strokeWidth: number;
  ringGap: number;
  colors: string[];
  /** 0 to 1 as the arcs sweep in. */
  reveal: SharedValue<number>;
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  radiusOf: (index: number) => number;
  /** Where the arcs begin, in degrees clockwise from twelve o'clock. */
  startAngle: number;
  /** How far they run, as a fraction of a full turn. 1 is a closed ring. */
  arc: number;
}

const RingChartContext = createContext<RingChartContextValue | null>(null);

function useChart(component: string): RingChartContextValue {
  const context = useContext(RingChartContext);
  if (!context) {
    throw new Error(`${component} must be used within a <RingChart>`);
  }
  return context;
}

/** The selected ring, for something rendered inside the chart. */
export function useRingChart() {
  const { data, activeIndex } = useChart('useRingChart');
  return {
    activeIndex,
    activeRing: activeIndex >= 0 ? (data[activeIndex] ?? null) : null,
  };
}

export interface RingChartProps extends ViewProps {
  className?: string;
  /** One entry per ring, outermost first. */
  data: RingDatum[];
  /** Fixed diameter in points. Measured from the container when omitted. */
  size?: number;
  /** Thickness of each ring. */
  strokeWidth?: number;
  /** Gap between one ring and the next. */
  ringGap?: number;
  /**
   * Where the arcs begin, in degrees clockwise from twelve o'clock. `0` is the
   * top, `90` the right-hand side.
   */
  startAngle?: number;
  /**
   * Where they end, on the same clock. Leaving a turn's worth between the two
   * gives a closed ring; anything less leaves a gap and reads as a gauge —
   * `startAngle={-90} endAngle={90}` is the half circle over the top.
   */
  endAngle?: number;
  /** Milliseconds for the arcs to sweep in. */
  animationDuration?: number;
  /** Selected ring. Leave unset to let the chart track it. */
  activeIndex?: number;
  /** Fires with the selected ring, or `-1` when the selection is cleared. */
  onActiveIndexChange?: (index: number) => void;
  children?: ReactNode;
}

/** Imperative handle: re-run the sweep, for a "replay" control. */
export interface RingChartHandle {
  replay: () => void;
}

const RingChartRoot = forwardRef<RingChartHandle, RingChartProps>(function RingChartRoot(
  {
    className,
    data,
    size,
    strokeWidth = 12,
    ringGap = 6,
    startAngle = 0,
    endAngle = 360,
    animationDuration = 700,
    activeIndex: activeIndexProp,
    onActiveIndexChange,
    children,
    ...props
  },
  ref
) {
  const [measured, setMeasured] = useState(0);
  const [internalActive, setInternalActive] = useState(-1);
  const reveal = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  const controlled = activeIndexProp !== undefined;
  const activeIndex = controlled ? activeIndexProp : internalActive;

  const setActiveIndex = useMemo(
    () => (index: number) => {
      if (!controlled) setInternalActive(index);
      onActiveIndexChange?.(index);
    },
    [controlled, onActiveIndexChange]
  );

  const box = size ?? measured;

  /*
   * The sweep as a fraction of a turn, which is the form every arc length here
   * is wanted in. Clamped to one turn because a ring drawn past 360° laps
   * itself, and clamped above zero because a ring of no length is not a chart.
   */
  const arc = Math.min(Math.max(endAngle - startAngle, 0), 360) / 360;

  /*
   * Outermost ring first, so `data[0]` is the one the eye lands on. Each ring
   * inside it steps in by its own thickness plus the gap.
   */
  const radiusOf = useMemo(
    () => (index: number) =>
      Math.max(box / 2 - strokeWidth / 2 - index * (strokeWidth + ringGap), strokeWidth / 2),
    [box, strokeWidth, ringGap]
  );

  const playReveal = useMemo(
    () => () => {
      if (reducedMotion) {
        reveal.value = 1;
        return;
      }
      reveal.value = 0;
      reveal.value = withTiming(1, {
        duration: animationDuration,
        easing: Easing.out(Easing.cubic),
      });
    },
    [reducedMotion, animationDuration, reveal]
  );

  const revealed = useRef(false);
  useEffect(() => {
    if (revealed.current || box <= 0 || !data.length) return;
    revealed.current = true;
    playReveal();
  }, [box, data.length, playReveal]);

  useImperativeHandle(ref, () => ({ replay: playReveal }), [playReveal]);

  // Resolved here rather than inside each ring, so the legend and the centre
  // readout can name a ring's colour without rendering one.
  const c1 = useSeriesColor(undefined, 1);
  const c2 = useSeriesColor(undefined, 2);
  const c3 = useSeriesColor(undefined, 3);
  const c4 = useSeriesColor(undefined, 4);
  const c5 = useSeriesColor(undefined, 5);
  const palette = useMemo(() => [c1, c2, c3, c4, c5], [c1, c2, c3, c4, c5]);
  const colors = useMemo(
    () => data.map((ring, index) => ring.color ?? palette[index % palette.length]!),
    [data, palette]
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    const next = Math.round(Math.min(width, height));
    if (next !== measured) setMeasured(next);
    props.onLayout?.(event);
  };

  const context = useMemo<RingChartContextValue>(
    () => ({
      data,
      size: box,
      strokeWidth,
      ringGap,
      colors,
      reveal,
      activeIndex,
      setActiveIndex,
      radiusOf,
      startAngle,
      arc,
    }),
    [
      data,
      box,
      strokeWidth,
      ringGap,
      colors,
      reveal,
      activeIndex,
      setActiveIndex,
      radiusOf,
      startAngle,
      arc,
    ]
  );

  const rings: ReactNode[] = [];
  const overlay: ReactNode[] = [];
  const header: ReactNode[] = [];
  Children.forEach(children, (child, index) => {
    if (!isValidElement(child)) return;
    const slot = (child.type as { slot?: Slot }).slot ?? 'overlay';
    (slot === 'ring' ? rings : slot === 'header' ? header : overlay).push(
      <ChildSlot key={index}>{child}</ChildSlot>
    );
  });

  return (
    <RingChartContext.Provider value={context}>
      {/*
       * Two views, because the header is not part of the plot. The square and
       * the layout measurement belong to the drawing area alone — measured on
       * the outer view they would take in the header too, and the rings would
       * be laid out inside a box taller than the one they are drawn in.
       */}
      <View {...props} style={props.style} className={cn('w-full', className)}>
        {header}
        {/*
         * Given a size the plot is that square and sits in the middle of
         * whatever it was handed; left to measure, it takes the width and is
         * as tall as it is wide. `size` is the usual answer inside a card —
         * a full-width square is twice the height the other charts take.
         */}
        <View
          onLayout={onLayout}
          style={size ? { width: size, height: size } : { aspectRatio: 1 }}
          className={cn('items-center justify-center', size ? 'self-center' : 'w-full')}
        >
          {box > 0 ? (
            <>
              <Svg width={box} height={box}>
                {rings}
              </Svg>
              {/*
               * The centre and the legend sit over the SVG rather than inside
               * it: both are text, and SVG text ignores the platform's text
               * scaling and the theme's font.
               */}
              <View
                pointerEvents="box-none"
                style={{ position: 'absolute', width: box, height: box }}
                className="items-center justify-center"
              >
                {overlay}
              </View>
            </>
          ) : null}
        </View>
      </View>
    </RingChartContext.Provider>
  );
});
RingChartRoot.displayName = 'RingChart';

function ChildSlot({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export interface RingChartRingProps {
  /** Which entry in `data` this ring draws. */
  index: number;
  /** Explicit colour, overriding the datum's and the token. */
  color?: string;
  /** Which of the five chart tokens to take, when the datum names no colour. */
  colorIndex?: SeriesColorIndex;
  /**
   * Rounded ends, or square ones. Defaults to round, and to square when the
   * ring is segmented — a rounded cap on a tick as long as it is wide draws a
   * lozenge rather than a tick.
   */
  lineCap?: 'round' | 'butt';
  /** Opacity of the track behind the arc. */
  trackOpacity?: number;
  /**
   * Break the ring into this many ticks, lit one at a time as the value
   * climbs. For a target made of countable things — eight of twelve sessions
   * reads off ticks you can count, and off a smooth arc only as "about two
   * thirds".
   */
  segments?: number;
  /** Gap between one tick and the next, in points. */
  segmentGap?: number;
}

/**
 * One ring: a full-circle track, and the arc showing how far along it the
 * value has got.
 *
 * The arc is swept with `strokeDasharray` rather than by rebuilding its path.
 * Both work, but a dash offset moves two numbers on a path that never changes
 * — and it keeps the rounded cap pinned to the moving end without any extra
 * geometry.
 */
function RingChartRing({
  index,
  color,
  colorIndex,
  lineCap,
  trackOpacity = 0.15,
  segments,
  segmentGap = 3,
}: RingChartRingProps) {
  const {
    data,
    size,
    strokeWidth,
    colors,
    reveal,
    activeIndex,
    setActiveIndex,
    radiusOf,
    startAngle,
    arc,
  } = useChart('RingChart.Ring');

  const datum = data[index];
  const tokenColor = useSeriesColor(undefined, colorIndex ?? 1);
  const stroke = color ?? datum?.color ?? (colorIndex ? tokenColor : colors[index]) ?? tokenColor;

  const radius = radiusOf(index);
  const circumference = 2 * Math.PI * radius;
  const centre = size / 2;
  /* The drawn part of the circle. The whole of it for a closed ring. */
  const arcLength = circumference * arc;
  const ticks = segments && segments > 0 ? Math.floor(segments) : 0;
  /* One tick and the gap after it. The gap is taken out of the tick, not added
     to it, so N ticks still span exactly the arc asked for. */
  const slot = ticks ? arcLength / ticks : 0;
  const dash = ticks ? Math.max(slot - segmentGap, 0.5) : 0;
  const cap = lineCap ?? (ticks ? 'butt' : 'round');

  const fraction = datum && datum.maxValue > 0 ? datum.value / datum.maxValue : 0;
  // A value past its target fills the ring and stops. Going round twice would
  // draw 110% as 10%, which is the wrong answer told confidently.
  const clamped = Math.max(0, Math.min(1, fraction));

  /*
   * Staggered outward-in, so the rings arrive as a sequence rather than all at
   * once. The window each gets is what is left after the stagger, so a chart
   * of five rings still finishes inside the one duration.
   */
  const count = Math.max(1, data.length);
  const start = (index / count) * 0.4;

  const props = useAnimatedProps(() => {
    const progress = Math.max(0, Math.min(1, (reveal.value - start) / 0.6));
    if (!ticks) {
      return { strokeDasharray: [arcLength * clamped * progress, circumference] };
    }
    /*
     * A tick is lit or it is not, so the sweep rounds to whole ones. The array
     * stays the same length whatever is lit — an unlit tick is a dash of no
     * length rather than a missing pair — because a dash pattern that changes
     * length between frames is a new pattern, not an animated one.
     */
    const lit = Math.round(ticks * clamped * progress);
    const pattern: number[] = [];
    for (let tick = 0; tick < ticks; tick += 1) {
      if (tick < lit) pattern.push(dash, slot - dash);
      else pattern.push(0, slot);
    }
    return { strokeDasharray: pattern };
  });

  const dimmed = activeIndex >= 0 && activeIndex !== index;

  if (!datum || radius <= 0) return null;

  /*
   * A circle's stroke starts at three o'clock, so everything is turned back a
   * quarter to put the start at twelve — an arc starting at three reads as a
   * gauge that has already been running. `startAngle` turns it on from there.
   */
  const rotate = `rotate(${startAngle - 90} ${centre} ${centre})`;
  /* The unlit part of a segmented ring is the gaps between its ticks, so the
     track is ticked too; an open gauge's track stops where its arc stops. */
  const trackDash = ticks ? [dash, slot - dash] : [arcLength, circumference];

  return (
    <G opacity={dimmed ? 0.35 : 1}>
      <Circle
        cx={centre}
        cy={centre}
        r={radius}
        stroke={stroke}
        strokeOpacity={trackOpacity}
        strokeWidth={strokeWidth}
        strokeLinecap={cap}
        strokeDasharray={trackDash}
        fill="none"
        transform={rotate}
      />
      <AnimatedCircle
        animatedProps={props}
        cx={centre}
        cy={centre}
        r={radius}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap={cap}
        fill="none"
        transform={rotate}
      />
      {/*
       * The touch target is the ring itself, drawn as a transparent stroke
       * over it and made wider than the ring — a twelve-point band is below
       * the size a finger can reliably hit. It follows the sweep rather than
       * closing the circle, so the dead half of a gauge stays dead.
       */}
      <Circle
        cx={centre}
        cy={centre}
        r={radius}
        stroke="transparent"
        strokeWidth={Math.max(strokeWidth, 28)}
        strokeDasharray={[arcLength, circumference]}
        fill="none"
        transform={rotate}
        onPress={() => setActiveIndex(activeIndex === index ? -1 : index)}
      />
    </G>
  );
}
RingChartRing.displayName = 'RingChart.Ring';
RingChartRing.slot = 'ring' as const;

export interface RingChartCenterProps {
  /**
   * Heading shown when no ring is selected. Defaults to the outermost ring's
   * own name, which is what the centre shows when nothing has been picked.
   */
  defaultLabel?: string;
  /** Format the number under the label. Defaults to a compact number. */
  formatValue?: (value: number, ring: RingDatum | null) => string;
  /**
   * Draw the middle yourself. Given the selected ring, or `null` when nothing
   * is selected.
   */
  children?: (ring: RingDatum | null) => ReactNode;
  className?: string;
}

/**
 * The readout in the hole.
 *
 * With nothing selected it shows the outermost ring — the one the eye lands on
 * first. Not a total: the rings measure different things against different
 * targets, so their values do not add up and their percentages do not average,
 * and a total here would be a confident number about nothing. Selecting a ring
 * swaps it for that ring's own figures.
 */
function RingChartCenter({
  defaultLabel,
  formatValue,
  children,
  className,
}: RingChartCenterProps) {
  const { data, activeIndex, strokeWidth, radiusOf } = useChart('RingChart.Center');

  /*
   * With nothing selected the centre shows the outermost ring — the one the
   * eye lands on — rather than an aggregate. There is no aggregate to show:
   * the rings measure different things against different targets, so their
   * values do not add up and their percentages do not average. A total here
   * would be a confident number about nothing.
   */
  const ring = (activeIndex >= 0 ? data[activeIndex] : data[0]) ?? null;
  const selected = activeIndex >= 0;
  const format = formatValue ?? ((amount: number) => compactNumber(amount));

  /*
   * The hole is what is left inside the innermost ring, measured off the same
   * function that places the rings so the two cannot disagree. Text wider than
   * it would sit on the arcs rather than inside them.
   */
  const inner = Math.max(radiusOf(Math.max(data.length - 1, 0)) - strokeWidth / 2, 0);
  // A square inside a circle, not across it: the corners of a box as wide as
  // the diameter fall outside the hole.
  const hole = inner * Math.SQRT2;

  return (
    <View
      pointerEvents="none"
      style={{ maxWidth: hole }}
      className={cn('items-center', className)}
    >
      {children ? (
        children(selected ? ring : null)
      ) : ring ? (
        <>
          <Text size="xs" muted numberOfLines={1}>
            {selected ? ring.label : (defaultLabel ?? ring.label)}
          </Text>
          {/* Below about ninety points there is no room for two lines and a
              headline, so the number gets the space and the rest is dropped. */}
          <Text size={hole < 90 ? 'lg' : 'xl'} weight="semibold" numberOfLines={1}>
            {format(ring.value, ring)}
          </Text>
          {hole >= 90 ? (
            <Text size="xs" muted numberOfLines={1}>
              {`of ${format(ring.maxValue, ring)}`}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
RingChartCenter.displayName = 'RingChart.Center';
RingChartCenter.slot = 'overlay' as const;

export interface RingChartLegendProps extends ViewProps {
  className?: string;
  /** Show each ring's percentage of its own target beside its name. */
  showValue?: boolean;
}

/**
 * A swatch and a name per ring, pressable in the same way the rings are — the
 * legend is usually the easier target of the two, and on a small chart it is
 * the only comfortable one.
 */
function RingChartLegend({ className, showValue = true, ...props }: RingChartLegendProps) {
  const { data, colors, activeIndex, setActiveIndex } = useChart('RingChart.Legend');

  if (!data.length) return null;

  return (
    <View
      {...props}
      pointerEvents="box-none"
      className={cn('absolute -bottom-2 w-full gap-1', className)}
    >
      {data.map((ring, index) => {
        const percent =
          ring.maxValue > 0 ? Math.round((ring.value / ring.maxValue) * 100) : 0;
        const dimmed = activeIndex >= 0 && activeIndex !== index;
        return (
          <Pressable
            key={ring.label}
            accessibilityRole="button"
            accessibilityLabel={`${ring.label}, ${percent} percent`}
            onPress={() => setActiveIndex(activeIndex === index ? -1 : index)}
            style={{ opacity: dimmed ? 0.4 : 1 }}
            className="flex-row items-center gap-1.5"
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: colors[index],
              }}
            />
            <Text size="xs" muted numberOfLines={1} className="flex-1">
              {ring.label}
            </Text>
            {showValue ? (
              <Text size="xs" weight="medium">
                {percent}%
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
RingChartLegend.displayName = 'RingChart.Legend';
RingChartLegend.slot = 'overlay' as const;

export interface RingChartHeaderProps extends ViewProps {
  className?: string;
  /** Small line above the value — what the chart is of. */
  title?: string;
  /** The readout. The largest thing on the card, and the first thing read. */
  value?: string;
  /** One muted line under the value — a period, a comparison, a target. */
  caption?: string;
  /** Prettier names for the rings, keyed by their `label`. */
  labels?: Record<string, string>;
  /**
   * Draw a swatch and a name per ring along the trailing edge. Prefer this to
   * `RingChart.Legend` on a chart that has a header: that legend hangs off the
   * bottom of the square, where it overlaps whatever is under the chart.
   */
  legend?: boolean;
  /** Trailing slot — a control, a badge, a range picker. Wins over `legend`. */
  children?: ReactNode;
}

/**
 * The strip above the rings: what the chart is of, what it currently reads, and
 * what the colours mean.
 *
 * It belongs to the chart rather than to the card around it because it is about
 * the *rings* — the number changes as one is selected, and the legend is the
 * list the chart itself is holding. The card's header is a caption on the tray
 * the chart sits in; this is the chart introducing itself.
 *
 * The value is not derived here. There is no total to derive: the rings measure
 * different things against different targets. Take it from `onActiveIndexChange`
 * and pass the formatted string down, so one header can show the headline figure
 * when nothing is selected and a ring's own when something is.
 */
function RingChartHeader({
  className,
  title,
  value,
  caption,
  labels,
  legend = false,
  children,
  ...props
}: RingChartHeaderProps) {
  const { data, colors } = useChart('RingChart.Header');
  const trailing =
    children ??
    (legend && data.length ? (
      <View className="flex-row flex-wrap items-center justify-end gap-x-3 gap-y-1">
        {data.map((ring, index) => (
          <View key={ring.label} className="flex-row items-center gap-1.5">
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: colors[index],
              }}
            />
            <Text size="xs" muted numberOfLines={1}>
              {labels?.[ring.label] ?? ring.label}
            </Text>
          </View>
        ))}
      </View>
    ) : null);

  return (
    <View
      {...props}
      className={cn('flex-row items-start justify-between gap-3 pb-3', className)}
    >
      <View className="flex-1 gap-0.5">
        {title ? (
          <Text size="xs" muted>
            {title}
          </Text>
        ) : null}
        {value ? (
          <Text size="xl" weight="bold">
            {value}
          </Text>
        ) : null}
        {caption ? (
          <Text size="xs" muted>
            {caption}
          </Text>
        ) : null}
      </View>
      {/* Shrinkable, unlike a view's default in React Native. Held rigid, a
          three-ring key takes the width it wants and the caption underneath
          the value wraps to two lines to make room for it. */}
      {trailing ? <View className="shrink pt-1">{trailing}</View> : null}
    </View>
  );
}
RingChartHeader.displayName = 'RingChart.Header';
RingChartHeader.slot = 'header' as const;

export const RingChart = Object.assign(RingChartRoot, {
  Header: RingChartHeader,
  Ring: RingChartRing,
  Center: RingChartCenter,
  Legend: RingChartLegend,
});
