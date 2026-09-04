/**
 * RadarChart — several measures of one thing, on one shape.
 *
 * A radar answers a question a bar chart cannot: not "which of these is
 * biggest" but "what shape is this". Five scores read as five bars are five
 * facts; read as a polygon they are a profile, and two profiles laid over each
 * other are comparable at a glance in a way two groups of bars never are.
 *
 * ```tsx
 * <RadarChart data={scores} axisKey="skill">
 *   <RadarChart.Header title="Team profile" legend />
 *   <RadarChart.Grid />
 *   <RadarChart.Axis />
 *   <RadarChart.Series dataKey="you" colorIndex={1} />
 *   <RadarChart.Series dataKey="team" colorIndex={2} />
 * </RadarChart>
 * ```
 *
 * That is also the shape's limit, and worth saying out loud: the order of the
 * axes changes the outline, and the outline is what people read. Two datasets
 * are only comparable on one radar if the axes are in the same order, and a
 * radar is the wrong chart for data whose axes have no natural order at all.
 *
 * The reveal grows the polygons out of the centre rather than sweeping across
 * them, because a polar chart has no left-hand edge for a sweep to start at.
 * Everything below the root is drawn on the UI thread.
 */
import {
  Children,
  createContext,
  forwardRef,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type ViewProps } from 'react-native';
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Polygon,
  Text as SvgText,
} from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import { Text } from '@/components/ui/text';
import { ChartAccessibilityData, type ChartAccessibilityProps } from '@/components/ui/chart-accessibility';
import { cn } from '@/lib/cn';
import {
  polarPoint,
  radarPath,
  useSeriesColor,
  type SeriesColorIndex,
} from '@/lib/chart';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Room reserved around the rings for the axis labels — wider than it is tall.
 *
 * Labels sit outside the shape rather than along an edge, and they are
 * horizontal text: the one at three o'clock needs its whole width to the right
 * of the ring, while the one at twelve needs a single line's height above it.
 * A square box therefore cannot hold them — either the sides are clipped or
 * the top and bottom are wasted — which is also why a radar drawn in a square
 * ends up so much taller than the wide charts beside it.
 */
const LABEL_ROOM = { x: 62, y: 26 };
/** …and with no axis labels asking for it, only enough not to clip the stroke. */
const BARE_ROOM = { x: 6, y: 6 };

/** How long the polygons take to grow out of the centre. */
const REVEAL_DURATION = 620;
/** …and how long one profile takes to travel to the next when the data changes. */
const MORPH_DURATION = 420;

/**
 * Ring diameter when nothing says otherwise.
 *
 * The other charts here fill their container, because they are wide and a
 * wider one carries more. A radar filling a panel is as tall as the panel is
 * wide — twice the height of the chart beside it, for the same handful of
 * numbers — so it sizes itself instead, and centres.
 */
const DEFAULT_SIZE = 180;

export type RadarChartStatus = 'loading' | 'ready';

/** One row is one axis: its label, and one value per series. */
export type RadarChartDatum = Record<string, string | number | null | undefined>;

interface RadarChartContextValue {
  data: RadarChartDatum[];
  axisKey: string;
  /** Centre of the rings, in view coordinates. */
  cx: number;
  cy: number;
  /** Radius of the outermost ring. */
  radius: number;
  /** The drawing box, so a label can be kept inside it rather than clipped. */
  width: number;
  height: number;
  status: RadarChartStatus;
  /** The value the outermost ring stands for, tweened. */
  domainMax: SharedValue<number>;
  /** …and the innermost, which is usually but not always zero. */
  domainMin: SharedValue<number>;
  reveal: SharedValue<number>;
  series: [string, string][];
  registerSeries: (key: string, color: string) => void;
  unregisterSeries: (key: string) => void;
}

const RadarChartContext = createContext<RadarChartContextValue | null>(null);

/** The chart's geometry and data, for a part or a readout beside one. */
export function useRadarChart(): RadarChartContextValue {
  const context = useContext(RadarChartContext);
  if (!context) throw new Error('useRadarChart must be used inside <RadarChart>.');
  return context;
}

function useChart(part: string): RadarChartContextValue {
  const context = useContext(RadarChartContext);
  if (!context) throw new Error(`${part} must be used inside <RadarChart>.`);
  return context;
}

/** Which layer a part draws into. */
type Layer = 'svg' | 'overlay' | 'header';

function partition(children: ReactNode) {
  const svg: ReactNode[] = [];
  const overlay: ReactNode[] = [];
  const header: ReactNode[] = [];
  Children.forEach(children, (child, index) => {
    if (!isValidElement(child)) return;
    const layer = (child.type as { layer?: Layer }).layer ?? 'svg';
    const slot = <ChildSlot key={index}>{child}</ChildSlot>;
    (layer === 'header' ? header : layer === 'overlay' ? overlay : svg).push(slot);
  });
  return { svg, overlay, header };
}

/** Keeps a child's own key out of the array index the partition gives it. */
function ChildSlot({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/** A theme token as a colour, with the usual guard for a token that is not one. */
function useToken(variable: string, fallback: string): string {
  const raw = useCSSVariable(variable);
  return typeof raw === 'string' ? raw : fallback;
}

/* ------------------------------------------------------------------ *
 * Root.
 * ------------------------------------------------------------------ */

export interface RadarChartProps extends Omit<ViewProps, 'children'> {
  className?: string;
  /** One row per axis, in the order they go round. */
  data: RadarChartDatum[];
  /** Key holding each row's axis label. */
  axisKey?: string;
  /**
   * `loading` holds the shape at the centre until the data arrives, then grows
   * it — one component throughout rather than a spinner swapped for a chart,
   * because swapping loses the transition.
   */
  status?: RadarChartStatus;
  /**
   * Diameter of the outermost ring, in points. The view is that plus the room
   * the axis labels need around it, and centres itself.
   *
   * The ring rather than the box, because the ring is the thing being sized —
   * a box measurement would mean "bigger" also meant "labels further from the
   * shape", and the chart would grow without the drawing growing with it.
   *
   * Pass `size={undefined}` with an `aspectRatio` to fill the container the
   * way the other charts do.
   */
  size?: number;
  /**
   * Width ÷ height when `size` is not given. `1` is the square a radar wants;
   * the rings stay circular whatever it is set to.
   */
  aspectRatio?: number;
  /**
   * Fix the scale instead of deriving it from the data. A radar almost always
   * wants this: the shape only means something against a known maximum, and a
   * scale that moves with the data makes two charts incomparable.
   */
  domain?: [number, number];
  /** Milliseconds for the reveal on mount. */
  animationDuration?: number;
  /** Drop the room reserved for axis labels, for a radar with none. */
  compact?: boolean;
  children?: ReactNode;
  /** Accessible data labels and optional activation for each axis row. */
  accessibilityLabelForDatum?: ChartAccessibilityProps<RadarChartDatum>['accessibilityLabelForDatum'];
  onAccessibilityDatumPress?: ChartAccessibilityProps<RadarChartDatum>['onAccessibilityDatumPress'];
}

/** Imperative handle: re-run the reveal on demand, for a "replay" control. */
export interface RadarChartHandle {
  replay: () => void;
}

const RadarChartRoot = forwardRef<RadarChartHandle, RadarChartProps>(
  function RadarChartRoot(
    {
      className,
      data,
      axisKey = 'axis',
      status = 'ready',
      size: fixedSize = DEFAULT_SIZE,
      aspectRatio = 1,
      domain,
      animationDuration = REVEAL_DURATION,
      compact = false,
      accessible,
      accessibilityLabel,
      accessibilityHint,
      accessibilityLabelForDatum,
      onAccessibilityDatumPress,
      children,
      ...props
    },
    ref
  ) {
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [series, setSeries] = useState<[string, string][]>([]);

    const reveal = useSharedValue(0);
    const domainMin = useSharedValue(0);
    const domainMax = useSharedValue(0);
    const reducedMotion = useReducedMotion();

    const registerSeries = useMemo(
      () => (key: string, color: string) =>
        setSeries((current) => {
          const existing = current.find(([k]) => k === key);
          if (existing?.[1] === color) return current;
          return [...current.filter(([k]) => k !== key), [key, color]];
        }),
      []
    );

    const unregisterSeries = useMemo(
      () => (key: string) => setSeries((current) => current.filter(([k]) => k !== key)),
      []
    );

    const room = compact ? BARE_ROOM : LABEL_ROOM;
    const cx = size.width / 2;
    const cy = size.height / 2;
    // Measured rather than assumed, so the `aspectRatio` path — where the box
    // is whatever the container gave it — lands on the same geometry.
    const radius = Math.max(
      Math.min(size.width / 2 - room.x, size.height / 2 - room.y),
      0
    );

    const seriesKeys = series.map(([key]) => key).join('|');
    const extent = useMemo<[number, number]>(() => {
      if (domain) return domain;
      const keys = seriesKeys ? seriesKeys.split('|') : [];
      let max = -Infinity;

      for (const row of data) {
        for (const key of keys) {
          const value = row[key];
          if (typeof value !== 'number' || Number.isNaN(value)) continue;
          if (value > max) max = value;
        }
      }

      if (max === -Infinity) return [0, 1];
      /*
       * From zero, always. A radar's rings are read as fractions of the whole —
       * "three quarters of the way out" — and a floor above zero makes a small
       * value look like a large one, which is the failure mode this chart is
       * most prone to.
       */
      return [0, max === 0 ? 1 : max * 1.05];
    }, [data, domain, seriesKeys]);

    const loading = status === 'loading';

    useEffect(() => {
      if (loading) return;
      const [min, max] = extent;
      domainMin.value = min;
      domainMax.value = max;
    }, [extent, loading, domainMin, domainMax]);

    const revealed = useRef(false);
  const playReveal = useMemo(
    () => () => {
      if (reducedMotion) {
        // Vendored: writing a SharedValue from an effect is how Reanimated is
        // driven, but react-hooks/immutability cannot see that. The same
        // false positive sits in the hand-vendored RingChart beside it.
        // eslint-disable-next-line react-hooks/immutability
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

  useEffect(() => {
    /*
     * Going back to `loading` arms the reveal again. Without this a chart
     * that is refetched comes back fully drawn on the frame the data lands,
     * which reads as the loading state having been for nothing.
     */
    if (loading) {
      revealed.current = false;
      // Vendored: see the note on `playReveal` above.
      // eslint-disable-next-line react-hooks/immutability
      reveal.value = 0;
      return;
    }
    if (revealed.current || radius <= 0 || !data.length) return;
    revealed.current = true;
    playReveal();
  }, [loading, radius, data.length, playReveal, reveal]);

    useImperativeHandle(ref, () => ({ replay: playReveal }), [playReveal]);

    const onLayout = (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      setSize((current) =>
        Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1
          ? current
          : { width, height }
      );
      props.onLayout?.(event);
    };

    const context = useMemo<RadarChartContextValue>(
      () => ({
        data,
        axisKey,
        cx,
        cy,
        radius,
        width: size.width,
        height: size.height,
        status,
        domainMin,
        domainMax,
        reveal,
        series,
        registerSeries,
        unregisterSeries,
      }),
      [
        data,
        axisKey,
        cx,
        cy,
        radius,
        size.width,
        size.height,
        status,
        domainMin,
        domainMax,
        reveal,
        series,
        registerSeries,
        unregisterSeries,
      ]
    );

    const { svg, overlay, header } = partition(children);

    /*
     * Two views, because the header is not part of the plot. `aspectRatio` and
     * the layout measurement belong to the drawing area alone — measured on the
     * outer view they would take in the header too, and the rings would lose as
     * much radius as the header took while still claiming the shape asked for.
     */
    return (
      <RadarChartContext.Provider value={context}>
        <View {...props} style={props.style} className={cn('w-full', className)}>
          {header}
          <ChartAccessibilityData
            chart="Radar chart"
            data={data}
            disabled={accessible === false || status === 'loading'}
            accessibilityLabel={accessibilityLabel}
            accessibilityHint={accessibilityHint}
            accessibilityLabelForDatum={accessibilityLabelForDatum}
            onAccessibilityDatumPress={onAccessibilityDatumPress}
            valueOf={(datum) => [
              [axisKey, datum[axisKey]],
              ...series.map(([key]) => [key, datum[key]] as [string, unknown]),
            ]}
          />
          <View
            onLayout={onLayout}
            style={
              fixedSize
                ? {
                    // The ring plus its label room — wider than tall, because
                    // the labels are.
                    width: fixedSize + room.x * 2,
                    height: fixedSize + room.y * 2,
                    maxWidth: '100%',
                  }
                : { aspectRatio }
            }
            className={fixedSize ? 'self-center' : 'w-full'}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {radius > 0 ? (
              <>
                <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
                  {svg}
                </Svg>
                {overlay}
              </>
            ) : null}
          </View>
        </View>
      </RadarChartContext.Provider>
    );
  }
);

/* ------------------------------------------------------------------ *
 * Grid — the rings, and the spokes under them.
 * ------------------------------------------------------------------ */

export interface RadarChartGridProps {
  /** How many rings, including the outermost. */
  rings?: number;
  /** Overrides the themed hairline colour. */
  color?: string;
  /** Draw the rings as circles rather than as polygons through the spokes. */
  circular?: boolean;
  /** Draw a line from the centre out to each axis. */
  spokes?: boolean;
}

/**
 * The scale, drawn as rings.
 *
 * Polygonal by default rather than circular, because the rings are read
 * against the shape laid over them — a round ring behind an angular polygon
 * gives every axis a different apparent distance to the edge, and the whole
 * point of the rings is to say how far out something is.
 */
function RadarChartGrid({
  rings = 4,
  color,
  circular = false,
  spokes = true,
}: RadarChartGridProps) {
  const { data, cx, cy, radius } = useChart('RadarChart.Grid');
  const themed = useToken('--color-border', 'rgba(128,128,128,0.2)');
  const stroke = color ?? themed;
  const count = data.length;

  if (count < 3) return null;

  const levels = Array.from({ length: rings }, (_, index) => ((index + 1) / rings) * radius);

  return (
    <G>
      {levels.map((r, index) =>
        circular ? (
          <Circle key={index} cx={cx} cy={cy} r={r} fill="none" stroke={stroke} strokeWidth={1} />
        ) : (
          <Polygon
            key={index}
            points={Array.from({ length: count }, (_, spoke) => {
              const point = polarPoint(cx, cy, r, spoke / count);
              return `${point.x},${point.y}`;
            }).join(' ')}
            fill="none"
            stroke={stroke}
            strokeWidth={1}
          />
        )
      )}
      {spokes
        ? Array.from({ length: count }, (_, index) => {
            const point = polarPoint(cx, cy, radius, index / count);
            return (
              <Line
                key={index}
                x1={cx}
                y1={cy}
                x2={point.x}
                y2={point.y}
                stroke={stroke}
                strokeWidth={1}
              />
            );
          })
        : null}
    </G>
  );
}

/* ------------------------------------------------------------------ *
 * Axis — the labels round the outside.
 * ------------------------------------------------------------------ */

export interface RadarChartAxisProps {
  /** Overrides the themed label colour. */
  color?: string;
  /** Label size in points. */
  fontSize?: number;
  /** How far outside the rings the labels sit. */
  offset?: number;
  /** Rewrites a label — to shorten it, or to add a unit. */
  formatLabel?: (label: string, index: number) => string;
}

/**
 * The axis names, placed around the rings.
 *
 * Each label is anchored by which side of the circle it is on rather than
 * centred on its point: a label centred at three o'clock overlaps the shape it
 * belongs to, and one centred at nine o'clock overlaps the view's edge.
 */
function RadarChartAxis({ color, fontSize = 11, offset = 10, formatLabel }: RadarChartAxisProps) {
  const { data, axisKey, cx, cy, radius, width, height } = useChart('RadarChart.Axis');
  const themed = useToken('--color-muted-foreground', '#737373');
  const fill = color ?? themed;
  const count = data.length;

  if (count < 3) return null;

  return (
    <G>
      {data.map((row, index) => {
        const raw = row[axisKey];
        const label = formatLabel
          ? formatLabel(String(raw ?? ''), index)
          : String(raw ?? '');
        const point = polarPoint(cx, cy, radius + offset, index / count);

        // Within a few points of the vertical it is a top or bottom label and
        // wants centring; either side of that it wants to run away from the
        // chart rather than across it.
        const dx = point.x - cx;
        const anchor = Math.abs(dx) < radius * 0.15 ? 'middle' : dx > 0 ? 'start' : 'end';

        /*
         * Pull the anchor back inside the view before drawing.
         *
         * SVG clips at its viewport and does not reflow, so a label wider than
         * the room left for it loses its tail with no sign that anything is
         * missing — the reader sees "Accur" and has no reason to think it was
         * ever longer. Nudging the anchor in costs a couple of points of gap
         * between the label and the ring, which is the cheaper of the two.
         */
        const estimated = label.length * fontSize * 0.55;
        const x =
          anchor === 'start'
            ? Math.min(point.x, Math.max(width - estimated, cx))
            : anchor === 'end'
              ? Math.max(point.x, Math.min(estimated, cx))
              : point.x;

        // Text is anchored on its baseline, so a label below the chart needs
        // pushing down by roughly its cap height to look level with one above.
        const dy = point.y < cy ? 0 : fontSize * 0.72;
        const y = Math.min(Math.max(point.y + dy, fontSize), height - 2);

        return (
          <SvgText
            key={index}
            x={x}
            y={y}
            fill={fill}
            fontSize={fontSize}
            fontWeight="500"
            textAnchor={anchor}
          >
            {label}
          </SvgText>
        );
      })}
    </G>
  );
}

/* ------------------------------------------------------------------ *
 * Series — one polygon.
 * ------------------------------------------------------------------ */

export interface RadarChartSeriesProps {
  /** Key holding this series' value on each row. */
  dataKey: string;
  /** Name for the legend. Defaults to `dataKey`. */
  name?: string;
  /**
   * Stroke colour. Defaults to the `--color-chart-*` token at `colorIndex`, so
   * a series follows the theme without the call site naming a colour.
   */
  color?: string;
  /** Which `--color-chart-*` token to take when `color` is not given. */
  colorIndex?: SeriesColorIndex;
  strokeWidth?: number;
  /**
   * Opacity of the fill. Two filled polygons over each other make a third
   * colour that means nothing, so drop it towards `0` — or to `0` — on the
   * second and subsequent series.
   */
  fillOpacity?: number;
  /** A dot at each vertex. Worth it on a radar with few axes. */
  showDots?: boolean;
}

/** One profile. */
function RadarChartSeries({
  dataKey,
  name,
  color,
  colorIndex = 1,
  strokeWidth = 2,
  fillOpacity = 0.18,
  showDots = false,
}: RadarChartSeriesProps) {
  const { data, cx, cy, radius, domainMin, domainMax, reveal, status, registerSeries, unregisterSeries } =
    useChart('RadarChart.Series');
  const stroke = useSeriesColor(color, colorIndex);
  const count = data.length;

  useEffect(() => {
    registerSeries(dataKey, stroke);
    return () => unregisterSeries(dataKey);
  }, [dataKey, stroke, registerSeries, unregisterSeries]);

  const values = useMemo(
    () =>
      data.map((row) => {
        const value = row[dataKey];
        return typeof value === 'number' && !Number.isNaN(value) ? value : null;
      }),
    [data, dataKey]
  );

  const loading = status === 'loading';

  /*
   * Where the shape is coming from and where it is going, and how far between
   * them it currently is.
   *
   * A radar is the chart people put behind a switch — this quarter or last,
   * you or the team — and a polygon that jumps from one profile to the next
   * loses the only thing worth showing at the moment of the switch, which is
   * which axes moved and by how much. Held as two arrays and tweened per
   * vertex, the outline travels and the eye follows the parts of it that
   * travelled furthest.
   */
  const from = useSharedValue<(number | null)[]>(values);
  const to = useSharedValue<(number | null)[]>(values);
  const morph = useSharedValue(1);
  const settled = useRef(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    // The first values are not a change from anything.
    if (!settled.current) {
      settled.current = true;
      from.value = values;
      to.value = values;
      morph.value = 1;
      return;
    }

    if (reducedMotion) {
      from.value = values;
      to.value = values;
      morph.value = 1;
      return;
    }

    // Leave from wherever the last tween had got to, so a switch part way
    // through another one carries on from the shape actually on screen.
    const t = morph.value;
    const previous = from.value;
    const current = to.value;
    from.value = current.map((value, index) => {
      const start = previous[index];
      if (value === null || start === null || start === undefined) return value ?? start ?? null;
      return start + (value - start) * t;
    });
    to.value = values;
    morph.value = 0;
    morph.value = withTiming(1, { duration: MORPH_DURATION });
  }, [values, reducedMotion, from, to, morph]);

  /*
   * The polygon is rebuilt on the UI thread every frame the reveal or the
   * morph is running. Scaling the *values* rather than transforming the group
   * is what makes the shape grow along its own axes — a `scale` transform
   * would grow the stroke and the dots with it, and arrive at the wrong
   * stroke width.
   */
  const animatedProps = useAnimatedProps(() => {
    const span = Math.max(domainMax.value - domainMin.value, 1e-6);
    const target = to.value;
    const start = from.value;
    const scaled = target.map((value, index) => {
      const a = start[index] ?? value;
      const b = value ?? a;
      if (a === null || a === undefined || b === null || b === undefined) return null;
      const mixed = a + (b - a) * morph.value;
      return ((mixed - domainMin.value) / span) * reveal.value;
    });
    return { d: loading ? '' : radarPath(scaled, cx, cy, radius) };
  });

  return (
    <G>
      <AnimatedPath
        animatedProps={animatedProps}
        fill={stroke}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {showDots && count >= 3
        ? values.map((value, index) =>
            value === null ? null : (
              <RadarDot
                key={index}
                index={index}
                turn={index / count}
                cx={cx}
                cy={cy}
                radius={radius}
                color={stroke}
                from={from}
                to={to}
                morph={morph}
                domainMin={domainMin}
                domainMax={domainMax}
                reveal={reveal}
              />
            )
          )
        : null}
    </G>
  );
}

/** One vertex, riding the same reveal and the same morph as its polygon. */
function RadarDot({
  index,
  turn,
  cx,
  cy,
  radius,
  color,
  from,
  to,
  morph,
  domainMin,
  domainMax,
  reveal,
}: {
  index: number;
  turn: number;
  cx: number;
  cy: number;
  radius: number;
  color: string;
  from: SharedValue<(number | null)[]>;
  to: SharedValue<(number | null)[]>;
  morph: SharedValue<number>;
  domainMin: SharedValue<number>;
  domainMax: SharedValue<number>;
  reveal: SharedValue<number>;
}) {
  const point = useDerivedValue(() => {
    const span = Math.max(domainMax.value - domainMin.value, 1e-6);
    const target = to.value[index];
    const start = from.value[index] ?? target;
    if (target === null || target === undefined || start === null || start === undefined) {
      return { x: cx, y: cy };
    }
    const mixed = start + (target - start) * morph.value;
    const fraction = ((mixed - domainMin.value) / span) * reveal.value;
    return polarPoint(cx, cy, radius * fraction, turn);
  });

  const animatedProps = useAnimatedProps(() => ({
    cx: point.value.x,
    cy: point.value.y,
  }));

  return <AnimatedCircle animatedProps={animatedProps} r={3} fill={color} />;
}

/* ------------------------------------------------------------------ *
 * Header and legend.
 * ------------------------------------------------------------------ */

export interface RadarChartHeaderProps {
  className?: string;
  /** Small caption above the value. */
  title?: string;
  /** The headline figure, if there is one. */
  value?: string;
  /** A line under the value. */
  caption?: string;
  /** Draw the series legend on the trailing end of the strip. */
  legend?: boolean;
  children?: ReactNode;
}

/** The strip above the rings. */
function RadarChartHeader({
  className,
  title,
  value,
  caption,
  legend = false,
  children,
}: RadarChartHeaderProps) {
  const { series } = useChart('RadarChart.Header');

  return (
    <View className={cn('flex-row items-start justify-between gap-3 pb-2', className)}>
      <View className="flex-1">
        {title ? (
          <Text size="sm" muted>
            {title}
          </Text>
        ) : null}
        {value ? (
          <Text size="2xl" weight="bold">
            {value}
          </Text>
        ) : null}
        {caption ? (
          <Text size="sm" muted>
            {caption}
          </Text>
        ) : null}
      </View>
      {legend ? (
        <View className="items-end gap-1">
          {series.map(([key, color]) => (
            <View key={key} className="flex-row items-center gap-1.5">
              <View
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              <Text size="sm" muted>
                {key}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export interface RadarChartLegendProps {
  className?: string;
  /** Rewrites a series' name — the key is rarely what a reader should see. */
  formatName?: (key: string) => string;
}

/**
 * The series, named and coloured.
 *
 * In the bottom-left of the plot rather than under it, which on a radar costs
 * nothing: the shape is a circle in a square box, so the corners are empty by
 * construction. Move it with `className`.
 */
function RadarChartLegend({ className, formatName }: RadarChartLegendProps) {
  const { series } = useChart('RadarChart.Legend');
  if (!series.length) return null;

  return (
    <View
      className={cn('absolute bottom-0 left-0 gap-1', className)}
      style={{ pointerEvents: 'none' }}
    >
      {series.map(([key, color]) => (
        <View key={key} className="flex-row items-center gap-1.5">
          <View className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          <Text size="sm" muted>
            {formatName ? formatName(key) : key}
          </Text>
        </View>
      ))}
    </View>
  );
}

RadarChartRoot.displayName = 'RadarChart';
RadarChartGrid.displayName = 'RadarChart.Grid';
RadarChartAxis.displayName = 'RadarChart.Axis';
RadarChartSeries.displayName = 'RadarChart.Series';
RadarChartHeader.displayName = 'RadarChart.Header';
RadarChartLegend.displayName = 'RadarChart.Legend';

// Which layer each part draws into. Read by `partition` on the root, so a part
// can be written in any order and still land in the right place.
(RadarChartGrid as { layer?: Layer }).layer = 'svg';
(RadarChartAxis as { layer?: Layer }).layer = 'svg';
(RadarChartSeries as { layer?: Layer }).layer = 'svg';
(RadarChartHeader as { layer?: Layer }).layer = 'header';
(RadarChartLegend as { layer?: Layer }).layer = 'overlay';

export const RadarChart = Object.assign(RadarChartRoot, {
  Header: RadarChartHeader,
  Grid: RadarChartGrid,
  Axis: RadarChartAxis,
  Series: RadarChartSeries,
  Legend: RadarChartLegend,
});
