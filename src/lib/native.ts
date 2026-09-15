/**
 * Optional bridge to the platform's own UI toolkit.
 *
 * A handful of controls are better served by the real thing than by a faithful
 * re-implementation: a switch, a picker, a sheet and a button are muscle
 * memory, and users notice when the animation curve or the haptic is a
 * near-miss. Passing `native` to those components hands rendering to SwiftUI
 * on iOS and Jetpack Compose on Android.
 *
 * It is optional on purpose. The package is resolved lazily and every caller
 * falls back to the styled implementation when it is missing, so nobody who
 * never writes `native` has to install anything.
 *
 * ```sh
 * npx expo install @expo/ui
 * ```
 *
 * **Theme tokens do not apply in native mode.** The platform draws the control
 * with its own colours, metrics and typography — that is the entire point, and
 * it means `className` and the variant props are ignored on those components.
 */
import type { ComponentType, ReactNode } from 'react';

interface NativeUIModule {
  Host: ComponentType<{
    children?: ReactNode;
    /**
     * Whether the host resizes itself to the platform content.
     *
     * This is on for every control here, and it is the whole answer to the
     * jump. Sizing the *host* and leaving the control unsized inside it hands
     * the platform a box it never agreed to: it lays out against its own
     * intrinsic size, and settles into the box on the first thing that forces
     * a second pass — which for a button is the first press.
     *
     * The per-axis form is for a control with no intrinsic width, like a
     * slider or a picker: the width comes from ordinary layout and only the
     * height is reported back.
     */
    matchContents?: boolean | { vertical?: boolean; horizontal?: boolean };
    /**
     * Which safe areas the host lets the platform inset its content for.
     *
     * Every host here passes `keyboard`, and it is not optional. A host is a
     * hosting controller, and a hosting controller insets its content for the
     * keyboard by default — so a control docked above the keyboard has its
     * content moved *inside* the box React Native gave it, over whatever is
     * above it, while React Native's own layout says nothing has moved. That
     * is a composer whose buttons sit on its text until the next layout pass
     * puts them back.
     *
     * React Native owns the layout of everything in this library, so a
     * platform that moves content inside a box we positioned is never right.
     * `keyboard` and not `all`: the notch and the home indicator are the
     * platform's business and stay its business.
     */
    ignoreSafeArea?: 'all' | 'container' | 'keyboard';
    style?: unknown;
    [key: string]: unknown;
  }>;
  /**
   * Hosts React Native views inside the native tree. Anything of ours that
   * goes inside a native container has to be wrapped in this or the native
   * layout does not measure it — children spill outside their container.
   */
  RNHostView: ComponentType<{
    children?: ReactNode;
    matchContents?: boolean;
    style?: unknown;
  }>;
  /**
   * `style` here is not a React Native style — it is the small portable subset
   * (`width`, `height`, padding, `backgroundColor`, `borderRadius`, `opacity`)
   * that the toolkit compiles into real SwiftUI and Compose modifiers. It is
   * how a control is given a definite size without the host having to guess.
   */
  Button: ComponentType<Record<string, unknown>>;
  Switch: ComponentType<Record<string, unknown>>;
  Slider: ComponentType<Record<string, unknown>>;
  Picker: ComponentType<Record<string, unknown>> & {
    Item: ComponentType<Record<string, unknown>>;
  };
  BottomSheet: ComponentType<Record<string, unknown>>;
}

let resolved = false;
let module: NativeUIModule | null = null;

/**
 * The native UI module, or null when it is not installed or the platform has
 * no toolkit behind it. Resolved once and cached — a failed require is not
 * retried on every render.
 */
export function getNativeUI(): NativeUIModule | null {
  if (resolved) return module;
  resolved = true;

  // Web has no SwiftUI and no Compose; @expo/ui renders plain views there,
  // which loses the styling without gaining anything.
  if (process.env.EXPO_OS === 'web') return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    module = require('@expo/ui') as NativeUIModule;
  } catch {
    module = null;
  }

  return module;
}

/** Whether `native` will actually render a platform control. */
export function hasNativeUI(): boolean {
  return getNativeUI() !== null;
}

/**
 * The SwiftUI view modifiers, for the handful of things the portable props
 * cannot express.
 *
 * The universal components cover the common ground — a variant, a size, an
 * enabled flag — but the platform has looks with no cross-platform equivalent,
 * and Liquid Glass is the one that matters: it is the material iOS 26 draws its
 * own floating controls in, and nothing in the portable API asks for it. A
 * modifier is how SwiftUI is configured, so this is the door to it.
 *
 * iOS only, and lazily resolved like everything else here. Android's toolkit
 * has its own modifier system and no equivalent material, so asking for glass
 * there is not a downgrade — it is a different question.
 */
interface SwiftUIModifiers {
  buttonStyle: (
    style:
      | 'automatic'
      | 'bordered'
      | 'borderedProminent'
      | 'borderless'
      | 'glass'
      | 'glassProminent'
      | 'plain'
  ) => unknown;
  buttonBorderShape: (
    shape: 'automatic' | 'capsule' | 'roundedRectangle' | 'circle',
    cornerRadius?: number
  ) => unknown;
  controlSize: (size: 'mini' | 'small' | 'regular' | 'large' | 'extraLarge') => unknown;
  /**
   * Paints a sheet's own surface, rather than a background behind its content.
   *
   * It is the only way out of the material a sheet is drawn in by default, and
   * it reaches what an ordinary background cannot: the grabber's strip at the
   * top and the safe-area inset at the bottom, which belong to the sheet's
   * chrome and not to anything hosted inside it.
   *
   * **iOS 16.4 and up.** Below that it is inert and the sheet keeps its
   * material — the same shape as glass being inert below iOS 26, and the same
   * trap: indistinguishable from the prop not working. Check the OS before
   * changing any code on a report of "the colour did nothing".
   */
  presentationBackground: (color: string) => unknown;
}

/**
 * The SwiftUI-only components, for the ones the universal set does not carry.
 *
 * `@expo/ui` exports a portable component for everything both toolkits agree
 * on, and that is what `getNativeUI` reaches. A popover is not on that list:
 * SwiftUI has one that anchors to a view and adapts itself on a compact
 * screen, and Compose's nearest relative is a dropdown menu, which is a
 * different control with different rules. Rather than pretend the two are one
 * thing, the iOS one is reached here and Android keeps the styled panel.
 */
interface SwiftUIComponents {
  Host: ComponentType<{
    children?: ReactNode;
    matchContents?: boolean | { vertical?: boolean; horizontal?: boolean };
    ignoreSafeArea?: unknown;
    style?: unknown;
  }>;
  RNHostView: ComponentType<{ children?: ReactNode; matchContents?: boolean }>;
  Popover: ComponentType<{
    children?: ReactNode;
    isPresented?: boolean;
    onIsPresentedChange?: (isPresented: boolean) => void;
    attachmentAnchor?: 'leading' | 'trailing' | 'center' | 'top' | 'bottom';
    arrowEdge?: 'leading' | 'trailing' | 'top' | 'bottom' | 'none';
  }> & {
    Trigger: ComponentType<{ children?: ReactNode }>;
    Content: ComponentType<{ children?: ReactNode }>;
  };
}

let swiftUIResolved = false;
let swiftUI: SwiftUIComponents | null = null;

export function getSwiftUI(): SwiftUIComponents | null {
  if (swiftUIResolved) return swiftUI;
  swiftUIResolved = true;

  if (process.env.EXPO_OS !== 'ios') return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('@expo/ui/swift-ui') as Partial<SwiftUIComponents>;
    // A version without the popover is not an error; it is a fallback to the
    // styled panel, which is what every missing native path here does.
    swiftUI =
      module.Host && module.RNHostView && module.Popover
        ? (module as SwiftUIComponents)
        : null;
  } catch {
    swiftUI = null;
  }

  return swiftUI;
}

let modifiersResolved = false;
let modifiers: SwiftUIModifiers | null = null;

export function getSwiftUIModifiers(): SwiftUIModifiers | null {
  if (modifiersResolved) return modifiers;
  modifiersResolved = true;

  if (process.env.EXPO_OS !== 'ios') return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modifiers = require('@expo/ui/swift-ui/modifiers') as SwiftUIModifiers;
  } catch {
    modifiers = null;
  }

  return modifiers;
}

/**
 * The Compose view modifiers — the other half of the same door.
 *
 * Android's toolkit has its own modifier system and its own vocabulary, so a
 * modifier built for one platform is not a modifier the other can read. Where
 * both are asked the same question the answers are written separately, here and
 * above, rather than one being sent to both.
 */
interface ComposeModifiers {
  background: (color: string) => unknown;
}

let composeResolved = false;
let compose: ComposeModifiers | null = null;

export function getComposeModifiers(): ComposeModifiers | null {
  if (composeResolved) return compose;
  composeResolved = true;

  if (process.env.EXPO_OS !== 'android') return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    compose = require('@expo/ui/jetpack-compose/modifiers') as ComposeModifiers;
  } catch {
    compose = null;
  }

  return compose;
}
