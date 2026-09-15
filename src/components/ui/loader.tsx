/**
 * Loading animations.
 *
 * ## Why one component and not nine
 *
 * These are interchangeable. A loader is chosen once, for the character it
 * gives a screen, and then it is the same loader everywhere — so the thing
 * that varies is a value, not a component. `variant` keeps the swap to one
 * word and keeps every one of them on the same props: the same colour
 * resolution, the same `speed`, the same reduced-motion behaviour, the same
 * accessibility. Nine exports would mean nine chances for those to drift.
 *
 * ## Why they are drawn the way they are
 *
 * Anything with a fixed, small number of moving pieces is a view per piece
 * with a `useAnimatedStyle` on it: three dots is three transforms a frame, and
 * that is cheaper than rebuilding a path string.
 *
 * Anything whose count is high, or whose shape is derived rather than
 * declared, is a single SVG path rebuilt on the UI thread. Fifteen bars
 * following a bouncing ball is one animated prop that way and fifteen the
 * other, and the fifteen do not stay in step with each other for free.
 *
 * ## Reduced motion
 *
 * Every variant draws a representative still frame rather than freezing at
 * whatever it happened to be showing. A stopped animation should look like a
 * shape someone drew, not like a bug caught mid-cycle.
 */
import { memo, useEffect, type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import Svg, { Ellipse, Path } from 'react-native-svg';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import { tv } from 'tailwind-variants';
import { useIconColor } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

export type LoaderVariant =
  | 'pulse-dots'
  | 'bounce-dots'
  | 'pulsating-dots'
  | 'liquid-dots'
  | 'bar-cascade'
  | 'bouncing-bars'
  | 'symmetric-wave'
  | 'morph-ring'
  | 'wave-physics';

export type LoaderSize = 'sm' | 'md' | 'lg';

const loaderVariants = tv({
  base: 'items-center justify-center',
});

export interface LoaderProps extends Omit<ViewProps, 'children'> {
  /**
   * Which animation to draw. They are interchangeable — pick one for the
   * character it gives the screen and keep it.
   */
  variant?: LoaderVariant;
  /** Overall scale. The geometry of every variant is multiplied by it. */
  size?: LoaderSize;
  /**
   * Ink. Takes a theme token by name — `"--color-primary"` — as readily as a
   * literal, and the token is usually what you want: a literal cannot follow
   * the theme into dark mode.
   *
   * With neither, the loader draws in the readable foreground of the surface
   * it is on, so one inside a filled button is legible without being told.
   */
  color?: string;
  /** Multiplier on the tempo. `1` is the designed speed; `2` is twice as fast. */
  speed?: number;
  /**
   * What a screen reader announces. Defaults to "Loading". Say what is
   * loading when the loader is the only thing on the screen.
   */
  label?: string;
  className?: string;
}

/** Geometry at `md`. Every number here is multiplied by the size scale. */
const GEOMETRY = {
  'pulse-dots': { dot: 10, gap: 6, count: 3 },
  'bounce-dots': { dot: 10, gap: 6, count: 3, travel: 8 },
  'pulsating-dots': { dot: 11, gap: 8, count: 3 },
  'liquid-dots': { radius: 11, travel: 15, width: 72, height: 32 },
  'bar-cascade': { bar: 5, gap: 4, count: 5, min: 8, max: 26 },
  'bouncing-bars': { bar: 5, gap: 6, count: 3, height: 30 },
  'symmetric-wave': { bar: 5, gap: 5, count: 9, min: 7, max: 26 },
  'morph-ring': { box: 34, border: 3 },
  'wave-physics': { bar: 5, gap: 3, count: 15, base: 7, peak: 26 },
} as const;

const SIZE_SCALE: Record<LoaderSize, number> = { sm: 0.75, md: 1, lg: 1.35 };

/**
 * A theme token rather than a colour. Tokens are named, not written, so the
 * leading `--` tells the two apart without the caller having to say which.
 */
function isToken(value: string | undefined): value is string {
  return typeof value === 'string' && value.startsWith('--');
}

/** One decimal is past the point a path string can show, and cheaper to build. */
function q(value: number): number {
  'worklet';
  return Math.round(value * 10) / 10;
}

/** A closed circle as a path subpath, so several can share one `Path`. */
function circle(cx: number, cy: number, r: number): string {
  'worklet';
  return (
    `M${q(cx - r)},${q(cy)}` +
    `A${q(r)},${q(r)} 0 1 0 ${q(cx + r)},${q(cy)}` +
    `A${q(r)},${q(r)} 0 1 0 ${q(cx - r)},${q(cy)}Z`
  );
}

/* -------------------------------------------------------------------------- */
/* dots                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * One dot.
 *
 * A component rather than a loop of `useAnimatedStyle` inside the parent: the
 * count is geometry, and a loop of hooks is a rule waiting to be broken by
 * whoever changes it.
 */
const Dot = memo(function Dot({
  size,
  color,
  delay,
  duration,
  from,
  to,
  property,
  still,
  animate,
}: {
  size: number;
  color: string;
  delay: number;
  duration: number;
  from: number;
  to: number;
  property: 'opacity' | 'translateY' | 'scale';
  /** The value to hold when nothing is animating. */
  still: number;
  animate: boolean;
}) {
  const progress = useSharedValue(animate ? from : still);

  useEffect(() => {
    if (!animate) {
      progress.value = still;
      return;
    }
    progress.value = from;
    progress.value = withDelay(
      delay,
      // Reversing rather than a three-stop keyframe: every one of these
      // animations returns to where it started, and a reversed repeat says so
      // in one line without a midpoint to keep in step.
      withRepeat(
        withTiming(to, { duration, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
      )
    );
    return () => cancelAnimation(progress);
  }, [animate, delay, duration, from, to, still, progress]);

  const style = useAnimatedStyle(() => {
    if (property === 'opacity') return { opacity: progress.value };
    if (property === 'translateY') {
      return { transform: [{ translateY: progress.value }] };
    }
    return {
      opacity: 0.5 + (progress.value - 1) * 1,
      transform: [{ scale: progress.value }],
    };
  });

  return (
    <Animated.View
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        style,
      ]}
    />
  );
});

/* -------------------------------------------------------------------------- */
/* bars                                                                       */
/* -------------------------------------------------------------------------- */

/** One bar. Same reasoning as `Dot`. */
const Bar = memo(function Bar({
  width,
  color,
  delay,
  duration,
  from,
  to,
  mode,
  barHeight,
  still,
  animate,
}: {
  width: number;
  color: string;
  delay: number;
  duration: number;
  /*
   * In `height` mode these are pixels; in `scale` mode they are multipliers of
   * `barHeight`. Keeping the box separate from the range is the whole reason
   * `barHeight` exists — conflated, a scale target reads as a height and the
   * bar grows to thirty times its size.
   */
  from: number;
  to: number;
  /** `height` grows the bar from its baseline; `scale` squashes a fixed one. */
  mode: 'height' | 'scale';
  /** The bar's laid-out height. Only used by `scale`. */
  barHeight?: number;
  still: number;
  animate: boolean;
}) {
  const progress = useSharedValue(animate ? from : still);

  useEffect(() => {
    if (!animate) {
      progress.value = still;
      return;
    }
    progress.value = from;
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(to, { duration, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
      )
    );
    return () => cancelAnimation(progress);
  }, [animate, delay, duration, from, to, still, progress]);

  const style = useAnimatedStyle(() =>
    mode === 'height'
      ? { height: progress.value }
      : { transform: [{ scaleY: progress.value }] }
  );

  return (
    <Animated.View
      style={[
        {
          width,
          borderRadius: width / 2,
          backgroundColor: color,
          ...(mode === 'scale' ? { height: barHeight } : null),
        },
        style,
      ]}
    />
  );
});

/* -------------------------------------------------------------------------- */
/* liquid dots                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Two blobs that merge as they cross.
 *
 * The merge is the whole animation, and it is drawn rather than filtered: a
 * blur-and-threshold pass is how this is usually done, and SVG filters do not
 * render on native at all. Instead the two circles and the neck between them
 * are three subpaths of one path, unioned by the non-zero fill rule — which
 * costs one animated prop a frame, and gives a crisper edge than a threshold
 * ever does.
 *
 * The neck is what sells it. It pinches inward as the blobs separate and
 * vanishes once they are far enough apart, so they let go of each other
 * instead of snapping.
 */
function LiquidDots({
  color,
  scale,
  speed,
  animate,
}: {
  color: string;
  scale: number;
  speed: number;
  animate: boolean;
}) {
  const g = GEOMETRY['liquid-dots'];
  const r = g.radius * scale;
  const travel = g.travel * scale;
  const width = g.width * scale;
  const height = g.height * scale;
  const cy = height / 2;
  const mid = width / 2;

  // -1 to 1: where the left blob is along its travel. The right blob mirrors.
  const t = useSharedValue(animate ? -1 : -0.35);

  useEffect(() => {
    if (!animate) {
      t.value = -0.35;
      return;
    }
    t.value = -1;
    t.value = withRepeat(
      withTiming(1, { duration: 2000 / speed, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
    return () => cancelAnimation(t);
  }, [animate, speed, t]);

  const props = useAnimatedProps(() => {
    const x1 = mid + t.value * travel;
    const x2 = mid - t.value * travel;
    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    const gap = right - left;

    let d = circle(left, cy, r) + circle(right, cy, r);

    /*
     * The neck only exists while the blobs are close enough to be pulling on
     * each other: `1` when they are concentric, and gone by the time they are
     * a radius apart. Squared, so it thins out quickly rather than trailing.
     *
     * The thickness is what the cutoff is really on. A falloff that only
     * approaches zero leaves a hairline spanning the gap for the whole of the
     * rest of the travel, and a one-pixel bar between two circles reads as a
     * drawing mistake rather than as a thinning neck — so below the point
     * where it is still legibly a neck, it is not drawn at all.
     */
    const pull = Math.max(0, 1 - gap / (r * 2.2));
    const half = r * pull * pull * 0.95;
    if (half > r * 0.12 && gap > 1) {
      // Pinched at the middle: the control point sits inside the straight
      // line between the two, which is what makes the join read as surface
      // tension rather than as a rectangle.
      const waist = half * 0.55;
      d +=
        `M${q(left)},${q(cy - half)}` +
        `Q${q((left + right) / 2)},${q(cy - waist)} ${q(right)},${q(cy - half)}` +
        `L${q(right)},${q(cy + half)}` +
        `Q${q((left + right) / 2)},${q(cy + waist)} ${q(left)},${q(cy + half)}Z`;
    }

    return { d };
  });

  return (
    <Svg width={width} height={height}>
      <AnimatedPath animatedProps={props} fill={color} fillRule="nonzero" />
    </Svg>
  );
}

/* -------------------------------------------------------------------------- */
/* wave physics                                                               */
/* -------------------------------------------------------------------------- */

/** How many bounces the ball takes crossing the row once. */
const BOUNCES = 4;

/**
 * A ball bouncing along a row of bars, pushing them down where it lands.
 *
 * The only variant with anything like physics in it, and the reason it is
 * procedural rather than a keyframe list: the bar heights are a function of
 * where the ball is, so they are derived every frame instead of stored. Fifteen
 * bars precomputed would be fifteen arrays that have to agree with each other
 * and with the ball, and none of them could respond to `speed`.
 *
 * Both the bars and the ball read the same clock, which is what keeps the
 * dent under the ball rather than near it.
 */
function WavePhysics({
  color,
  scale,
  speed,
  animate,
}: {
  color: string;
  scale: number;
  speed: number;
  animate: boolean;
}) {
  const g = GEOMETRY['wave-physics'];
  const barWidth = g.bar * scale;
  const step = (g.bar + g.gap) * scale;
  const base = g.base * scale;
  const peak = g.peak * scale;
  const ballR = (g.bar * 1.1) * scale;
  const bounce = peak * 0.9;

  const width = (g.count - 1) * step + barWidth;
  const height = base + peak + bounce + ballR * 2;
  const floor = height;

  const clock = useSharedValue(0);

  const frame = useFrameCallback((info) => {
    'worklet';
    // Accumulated rather than read off the total, so `speed` can change
    // mid-animation without the ball jumping to where the new rate would have
    // put it. A dropped frame is clamped: a 300ms hitch played at full rate
    // is a lurch, not a bounce.
    const delta = Math.min(info.timeSincePreviousFrame ?? 16, 48) / 1000;
    clock.value += delta * speed * 0.35;
  }, false);

  const { setActive } = frame;
  useEffect(() => {
    setActive(animate);
    return () => setActive(false);
  }, [animate, setActive]);

  /** Where the ball is, as a bar index, and how far through its hop. */
  const ballAt = (time: number) => {
    'worklet';
    // Back and forth along the row, then back again — one continuous pass.
    const cycle = time % 2;
    const across = cycle < 1 ? cycle : 2 - cycle;
    const index = across * (g.count - 1);
    let phase = (across * BOUNCES) % 1;
    if (across === 0 || across === 1) phase = 0;
    // A parabola per hop: the ball is slowest at the top, which is the only
    // part of a bounce anyone actually reads.
    const lift = 4 * phase * (1 - phase);
    return { index, lift };
  };

  const barProps = useAnimatedProps(() => {
    const { index, lift } = animate ? ballAt(clock.value) : { index: 7, lift: 0.5 };
    // The ball presses hardest when it is on the ground, so the dent is the
    // inverse of the hop.
    const press = Math.max(0, 1 - lift * 2);
    let d = '';

    for (let i = 0; i < g.count; i++) {
      const distance = Math.abs(i - index);
      // A raised crest travelling with the ball, three bars wide either side.
      const crest = distance < 3 ? Math.cos((distance / 3) * (Math.PI / 2)) : 0;
      // And a dent right under it, narrower than the crest so the bar the
      // ball is standing on is pushed down through its own rise.
      const dent =
        distance < 1.5
          ? Math.cos((distance / 1.5) * (Math.PI / 2)) * press * (peak * 0.5)
          : 0;
      const barHeight = Math.max(base * 0.5, base + crest * peak - dent);
      const x = q(barWidth / 2 + i * step);
      d += `M${x},${q(floor)}L${x},${q(floor - barHeight)}`;
    }

    return { d };
  });

  const ballProps = useAnimatedProps(() => {
    const { index, lift } = animate ? ballAt(clock.value) : { index: 7, lift: 0.5 };
    const press = Math.max(0, 1 - lift * 2);
    // The ball rides the bar directly under it, which is the crest of the
    // wave (so the full `peak`) minus however hard it is pressing.
    const rest = base + peak - press * (peak * 0.5);

    // Squash on the ground, stretch at the top — the oldest trick there is,
    // and the thing that separates a bouncing ball from a moving circle.
    const squash = press;
    return {
      cx: q(barWidth / 2 + index * step),
      cy: q(floor - rest - ballR + squash * ballR * 0.3 - lift * bounce),
      rx: q(ballR * (1 + squash * 0.25)),
      ry: q(ballR * (1 - squash * 0.28)),
    };
  });

  return (
    <Svg width={width} height={height}>
      <AnimatedPath
        animatedProps={barProps}
        stroke={color}
        strokeWidth={barWidth}
        strokeLinecap="round"
        fill="none"
        opacity={0.55}
      />
      <AnimatedEllipse animatedProps={ballProps} fill={color} />
    </Svg>
  );
}

/* -------------------------------------------------------------------------- */
/* morph ring                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A square turning into a circle and back while it rotates.
 *
 * The rotation is what makes the morph legible: a square becoming a circle in
 * place mostly reads as a square getting smaller, and turning it means the
 * corners are visibly going somewhere as they round off.
 */
function MorphRing({
  color,
  scale,
  speed,
  animate,
}: {
  color: string;
  scale: number;
  speed: number;
  animate: boolean;
}) {
  const g = GEOMETRY['morph-ring'];
  const box = g.box * scale;
  const border = Math.max(2, g.border * scale);

  const progress = useSharedValue(animate ? 0 : 0.5);

  useEffect(() => {
    if (!animate) {
      progress.value = 0.5;
      return;
    }
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: 2000 / speed, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
    return () => cancelAnimation(progress);
  }, [animate, speed, progress]);

  const style = useAnimatedStyle(() => ({
    borderRadius: box * (0.1 + progress.value * 0.4),
    transform: [{ rotate: `${progress.value * 180}deg` }],
  }));

  /*
   * The padding is the rotation's. A square turned 45° needs its diagonal, so
   * it sweeps past its own box by nearly half its width on each side — laid
   * out flush, the corners spill over whatever is next to it.
   */
  const overhang = (box * Math.SQRT2 - box) / 2;

  return (
    <View style={{ padding: overhang }}>
      <Animated.View
        style={[
          { width: box, height: box, borderWidth: border, borderColor: color },
          style,
        ]}
      />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* root                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A loading animation.
 *
 * Nine of them, chosen with `variant`. They all take the same colour, the same
 * `speed`, and the same treatment under reduced motion, so swapping one for
 * another is a one-word change.
 */
export const Loader = memo(function Loader({
  variant = 'pulse-dots',
  size = 'md',
  color,
  speed = 1,
  label = 'Loading',
  className,
  ...props
}: LoaderProps) {
  const reducedMotion = useReducedMotion();
  const animate = !reducedMotion && speed > 0;
  const scale = SIZE_SCALE[size];
  const rate = speed > 0 ? speed : 1;

  /*
   * A loader inside a filled surface has to be drawn in that surface's
   * foreground rather than the page's: a button in the primary colour is one
   * of the most likely places for a loader to appear, and in most themes the
   * primary colour *is* the page's foreground — so one resolving
   * `--color-foreground` for itself would be invisible exactly there.
   * Surfaces already publish their readable foreground for icons.
   */
  const inherited = useIconColor();
  const token = useCSSVariable(isToken(color) ? color : '--color-foreground');
  const resolved = typeof token === 'string' ? token : undefined;
  const ink =
    (isToken(color) ? resolved : color) ?? inherited ?? resolved ?? '#0a0a0a';

  const frame = (content: ReactNode) => (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      className={loaderVariants({ className })}
      {...props}
    >
      {content}
    </View>
  );

  if (variant === 'liquid-dots') {
    return frame(
      <LiquidDots color={ink} scale={scale} speed={rate} animate={animate} />
    );
  }

  if (variant === 'wave-physics') {
    return frame(
      <WavePhysics color={ink} scale={scale} speed={rate} animate={animate} />
    );
  }

  if (variant === 'morph-ring') {
    return frame(
      <MorphRing color={ink} scale={scale} speed={rate} animate={animate} />
    );
  }

  if (variant === 'pulse-dots') {
    const g = GEOMETRY['pulse-dots'];
    return frame(
      <View className="flex-row items-center" style={{ gap: g.gap * scale }}>
        {Array.from({ length: g.count }, (_unused, i) => (
          <Dot
            key={i}
            size={g.dot * scale}
            color={ink}
            delay={(i * 200) / rate}
            duration={700 / rate}
            from={0.2}
            to={1}
            still={i === 1 ? 1 : 0.45}
            property="opacity"
            animate={animate}
          />
        ))}
      </View>
    );
  }

  if (variant === 'bounce-dots') {
    const g = GEOMETRY['bounce-dots'];
    const travel = g.travel * scale;
    return frame(
      <View
        className="flex-row items-center"
        style={{ gap: g.gap * scale, paddingTop: travel }}
      >
        {Array.from({ length: g.count }, (_unused, i) => (
          <Dot
            key={i}
            size={g.dot * scale}
            color={ink}
            delay={(i * 100) / rate}
            duration={300 / rate}
            from={0}
            to={-travel}
            still={-travel * (i === 1 ? 1 : 0.35)}
            property="translateY"
            animate={animate}
          />
        ))}
      </View>
    );
  }

  if (variant === 'pulsating-dots') {
    const g = GEOMETRY['pulsating-dots'];
    return frame(
      <View
        className="flex-row items-center"
        // A dot at its largest is half again its laid-out size, and it grows
        // about its centre — so a quarter of a dot on each side is the room
        // the scale needs, plus a little for the rounding.
        style={{ gap: g.gap * scale, padding: g.dot * scale * 0.3 }}
      >
        {Array.from({ length: g.count }, (_unused, i) => (
          <Dot
            key={i}
            size={g.dot * scale}
            color={ink}
            delay={(i * 200) / rate}
            duration={600 / rate}
            from={1}
            to={1.5}
            still={i === 1 ? 1.4 : 1.1}
            property="scale"
            animate={animate}
          />
        ))}
      </View>
    );
  }

  if (variant === 'bar-cascade') {
    const g = GEOMETRY['bar-cascade'];
    return frame(
      <View
        className="flex-row items-center"
        style={{ gap: g.gap * scale, height: g.max * scale }}
      >
        {Array.from({ length: g.count }, (_unused, i) => (
          <Bar
            key={i}
            width={g.bar * scale}
            color={ink}
            delay={(i * 100) / rate}
            duration={500 / rate}
            from={g.min * scale}
            to={g.max * scale}
            // A still frame that shows the cascade's shape rather than a row
            // of equal bars, which would say nothing about what it does.
            still={(g.min + (g.max - g.min) * Math.abs(Math.sin(i * 0.9))) * scale}
            mode="height"
            animate={animate}
          />
        ))}
      </View>
    );
  }

  if (variant === 'bouncing-bars') {
    const g = GEOMETRY['bouncing-bars'];
    return frame(
      <View
        className="flex-row items-center"
        style={{ gap: g.gap * scale, height: g.height * scale }}
      >
        {Array.from({ length: g.count }, (_unused, i) => (
          <Bar
            key={i}
            width={g.bar * scale}
            color={ink}
            delay={(i * 200) / rate}
            duration={500 / rate}
            from={0.3}
            to={1}
            barHeight={g.height * scale}
            still={0.4 + i * 0.25}
            mode="scale"
            animate={animate}
          />
        ))}
      </View>
    );
  }

  // symmetric-wave
  const g = GEOMETRY['symmetric-wave'];
  /*
   * The delay is symmetric about the middle rather than running left to right,
   * so the wave opens outward from the centre and arrives back at it. A
   * straight ramp reads as a queue; this reads as one thing breathing.
   */
  const offsets = [0, 1, 2, 3, 4, 3, 2, 1, 0];
  return frame(
    <View
      className="flex-row items-center"
      style={{ gap: g.gap * scale, height: g.max * scale }}
    >
      {Array.from({ length: g.count }, (_unused, i) => (
        <Bar
          key={i}
          width={g.bar * scale}
          color={ink}
          delay={((offsets[i] ?? 0) * 100) / rate}
          duration={600 / rate}
          from={g.min * scale}
          to={g.max * scale}
          still={(g.min + (g.max - g.min) * (1 - (offsets[i] ?? 0) / 4)) * scale}
          mode="height"
          animate={animate}
        />
      ))}
    </View>
  );
});
Loader.displayName = 'Loader';
