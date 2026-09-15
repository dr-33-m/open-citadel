/**
 * Glass — the material iOS draws its own floating controls in.
 *
 * A control that floats over content needs to read as *over* it, and a flat
 * fill cannot say that: it either hides what is behind it or disappears into
 * it. The system material does both jobs at once — it refracts what is behind,
 * lifts its own edge, and stays legible over anything.
 *
 * ```tsx
 * <Glass radius={28} className="px-4 py-3">
 *   <Text>Over whatever is behind it.</Text>
 * </Glass>
 * ```
 *
 * ## Where it is real, and where it is not
 *
 * The material exists on iOS 26 and above. Below that, on Android, on web, and
 * for anyone who has switched Reduce Transparency on, this draws
 * `fallbackClassName` instead — a solid token surface. That is deliberate
 * rather than a gap: a hand-drawn approximation of a system material is a
 * near-miss on the one platform that has the real thing, and on Android it is
 * an iOS look pasted onto a platform that never asked for it.
 *
 * So `Glass` is not a promise that the screen will be glass. It is a promise
 * that the container will be drawn correctly either way, and callers should
 * pick a `fallbackClassName` that stands on its own.
 *
 * ## The material is a layer, not the box
 *
 * The native view is rendered as a non-interactive layer filling this
 * container, with the content above it, for the same reason `Scrim` layers a
 * blur: it keeps every layout class, every token and every touch target on an
 * ordinary `View` that behaves the way the rest of the library does.
 *
 * `radius` is a number rather than a class because the material has to round
 * its own corners — clipping a square one to a rounded parent throws away the
 * lit edge that makes it read as glass.
 *
 * ## Do not fade it
 *
 * Setting `opacity` to `0` on the material or on anything above it stops it
 * rendering at all, and it does not come back when the opacity does. Move it,
 * or unmount it; never animate it out.
 */
import type { ComponentType, ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { cn } from '@/lib/cn';
import { useReduceTransparency } from '@/components/ui/scrim';

/** How the material treats what is behind it. */
export type GlassVariant = 'regular' | 'clear';

/**
 * Corner radius in points — one number for all four, or a top and a bottom.
 *
 * The two-sided form is for a surface with an edge that is not a real edge: a
 * sheet docked to the bottom of the screen rounds its top and leaves its
 * bottom square, because the screen edge is where it ends.
 */
export type GlassRadius = number | { top?: number; bottom?: number };

function shapeOf(radius: GlassRadius | undefined) {
  if (radius === undefined) return null;
  if (typeof radius === 'number') return { borderRadius: radius };
  return {
    borderTopLeftRadius: radius.top ?? 0,
    borderTopRightRadius: radius.top ?? 0,
    borderBottomLeftRadius: radius.bottom ?? 0,
    borderBottomRightRadius: radius.bottom ?? 0,
  };
}

interface GlassViewProps {
  glassEffectStyle?: GlassVariant | 'none';
  tintColor?: string;
  colorScheme?: 'auto' | 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
  pointerEvents?: ViewProps['pointerEvents'];
  children?: ReactNode;
}

/**
 * `expo-glass-effect`'s GlassView, or null when the material cannot be drawn
 * here.
 *
 * Resolved once at module load, behind three gates that all have to pass. The
 * package is optional, so the require can fail; the API is missing from some
 * iOS 26 builds, and reaching for it there crashes; and the design itself is
 * only present when the app was compiled for it. Asking all three once is
 * cheaper than a try/catch on every render, and there is no answer that can
 * change while the process is alive.
 */
const GlassView: ComponentType<GlassViewProps> | null = (() => {
  if (process.env.EXPO_OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-glass-effect');
    if (typeof mod?.isGlassEffectAPIAvailable === 'function' && !mod.isGlassEffectAPIAvailable()) {
      return null;
    }
    if (typeof mod?.isLiquidGlassAvailable === 'function' && !mod.isLiquidGlassAvailable()) {
      return null;
    }
    return (mod?.GlassView as ComponentType<GlassViewProps>) ?? null;
  } catch {
    return null;
  }
})();

/**
 * True when the real material can be drawn — for a caller that wants to know
 * before it commits to a look. It says nothing about Reduce Transparency, which
 * is a live preference and belongs to the hook.
 */
export const hasGlass = GlassView !== null;

export interface GlassProps extends ViewProps {
  /**
   * How much of what is behind shows through. `regular` is the everyday
   * material; `clear` is thinner, for something over its own artwork.
   */
  variant?: GlassVariant;
  /** Tints the material. Takes a colour, not a token name. */
  tint?: string;
  /**
   * Corner radius in points. The material rounds itself to this, so give it
   * the same shape the container is drawn with — clipping a square material
   * to a rounded parent throws away the lit edge that makes it read as glass.
   */
  radius?: GlassRadius;
  /** Applied only when the material cannot be drawn. Give it a real surface. */
  fallbackClassName?: string;
  className?: string;
}

export function Glass({
  variant = 'regular',
  tint,
  radius,
  fallbackClassName = 'bg-card',
  className,
  children,
  style,
  ...props
}: GlassProps) {
  const reduceTransparency = useReduceTransparency();
  // Not knowing yet counts as "do not draw it": the material arriving a frame
  // late is invisible, and one flashing at somebody who opted out is not.
  const material = GlassView !== null && reduceTransparency === false;
  const shape = shapeOf(radius);

  return (
    <View
      className={cn('overflow-hidden', material ? null : fallbackClassName, className)}
      style={[shape, style]}
      {...props}
    >
      {material && GlassView ? (
        <GlassView
          glassEffectStyle={variant}
          tintColor={tint}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, shape]}
        />
      ) : null}
      {children}
    </View>
  );
}

Glass.displayName = 'Glass';
