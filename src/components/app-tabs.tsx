import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  type TabTriggerSlotProps,
} from 'expo-router/ui';
import {
  ChartNoAxesGantt,
  Compass,
  Library,
  MessageSquare,
  Settings,
  type LucideIcon,
} from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Touchable } from '@/components/ui/touchable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/use-colors';
import { easingCss, elevation, iconSize, motion, spacing } from '@/constants/theme';

/**
 * Selection is a two-state flip, so it's a CSS transition rather than a
 * worklet: no shared value, no `useAnimatedStyle`, nothing per-instance to
 * re-attach when the bar re-renders. Reanimated still runs it on the UI
 * thread — it just derives the animation from the style change itself.
 */
const FADE = {
  transitionProperty: 'opacity',
  transitionDuration: `${motion.base}ms`,
  transitionTimingFunction: easingCss,
} as const;

export default function AppTabs() {
  return (
    <Tabs>
      {/* Absolutely filled: the floating bar below is also absolute (removed
          from flow), so this is the only flex child left and would otherwise
          stretch to fill the space anyway — but staying explicit here means
          screen content genuinely extends the full height behind the bar
          rather than stopping short of it, which is what makes the bar's
          transparent margins show scrolled content instead of empty screen
          background. */}
      <TabSlot style={StyleSheet.absoluteFillObject} />
      <TabList asChild>
        <CustomTabBar>
          <TabTrigger name="index" href="/" asChild>
            <TabButton icon={ChartNoAxesGantt}>TIMELINE</TabButton>
          </TabTrigger>
          <TabTrigger name="library" href="/library" asChild>
            <TabButton icon={Library}>LIBRARY</TabButton>
          </TabTrigger>
          {/* Compass sits at the centre: it is the paid product the rest of the app feeds. */}
          <TabTrigger name="compass" href="/compass" asChild>
            <TabButton icon={Compass} featured>
              COMPASS
            </TabButton>
          </TabTrigger>
          <TabTrigger name="chat" href="/chat" asChild>
            <TabButton icon={MessageSquare}>CHAT</TabButton>
          </TabTrigger>
          <TabTrigger name="settings" href="/settings" asChild>
            <TabButton icon={Settings}>SETTINGS</TabButton>
          </TabTrigger>
        </CustomTabBar>
      </TabList>
    </Tabs>
  );
}

const TAB_BAR_CONTENT_HEIGHT = iconSize.nav + spacing[3] * 2;
const TAB_BAR_WRAP_TOP = spacing[2];
const TAB_BAR_WRAP_BOTTOM_MIN = spacing[3];

/**
 * How much bottom padding a tab screen's own scroll content needs to clear the
 * floating bar. The bar is a true overlay now (position: absolute, transparent
 * margins), so content that doesn't reserve this space ends up with its last
 * items permanently stuck underneath it — this is the single source of truth
 * for the bar's own footprint, shared by every tab screen.
 */
export function floatingTabBarHeight(insetsBottom: number): number {
  return TAB_BAR_CONTENT_HEIGHT + TAB_BAR_WRAP_TOP + Math.max(insetsBottom, TAB_BAR_WRAP_BOTTOM_MIN);
}

function TabButton({
  children,
  isFocused,
  icon: Icon,
  featured = false,
  ...props
}: TabTriggerSlotProps & { icon?: LucideIcon; featured?: boolean }) {
  const colors = useColors();

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        tabButton: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: spacing[3],
        },
        iconBox: {
          width: iconSize.nav,
          height: iconSize.nav,
        },
        iconLayer: {
          ...StyleSheet.absoluteFillObject,
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [],
  );

  /**
   * The Compass cell is a plain tab until it's the active one. Only then does it
   * become architecturally different: side dividers and a gold top rule. Both
   * the frame and the plain layout coexist (the frame is an absolute overlay,
   * not a swapped style), so selecting Compass fades the frame in rather than
   * popping it — the bar row still stretches every cell to its own height by
   * default, so this only ever has to paint its own background and borders.
   */
  const frame = React.useMemo(
    () => ({
      backgroundColor: colors.surface.mid,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderLeftColor: colors.outline.variant,
      borderRightColor: colors.outline.variant,
      borderTopWidth: 2,
      borderTopColor: colors.primary.default,
    }),
    [colors],
  );
  const label = typeof children === 'string' ? children : undefined;

  return (
    <Touchable
      {...props}
      haptic="select"
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFocused }}
      style={styles.tabButton}
    >
      {featured && (
        <Animated.View
          style={[StyleSheet.absoluteFillObject, frame, FADE, { opacity: isFocused ? 1 : 0 }]}
        />
      )}
      {/* Two stacked icon layers crossfading tint, rather than animating the
          `color` prop directly — reliable across icon libraries since it never
          depends on the SVG accepting an animated prop. */}
      {Icon && (
        <View style={styles.iconBox}>
          <Animated.View style={[styles.iconLayer, FADE, { opacity: isFocused ? 0 : 1 }]}>
            <Icon size={iconSize.nav} color={colors.text.secondary} strokeWidth={2} />
          </Animated.View>
          <Animated.View style={[styles.iconLayer, FADE, { opacity: isFocused ? 1 : 0 }]}>
            <Icon size={iconSize.nav} color={colors.primary.default} strokeWidth={2} />
          </Animated.View>
        </View>
      )}
    </Touchable>
  );
}

function CustomTabBar(props: { children: React.ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        // Absolute and transparent, removed from flow entirely: TabSlot behind
        // it fills the whole screen (see AppTabs), so scrolled content is
        // genuinely visible through the margin on every side, not just the
        // plain screen background. zIndex guards against a content card's own
        // elevation.card winning paint order on Android, where elevation (not
        // just sibling order) can affect stacking.
        floatingWrap: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 10,
          paddingTop: TAB_BAR_WRAP_TOP,
          paddingHorizontal: spacing[5],
          paddingBottom: Math.max(insets.bottom, TAB_BAR_WRAP_BOTTOM_MIN),
        },
        bar: {
          flexDirection: 'row',
          alignItems: 'stretch',
          backgroundColor: colors.surface.low,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.outline.variant,
          ...elevation.card,
        },
      }),
    [colors, insets.bottom],
  );

  return (
    <View style={styles.floatingWrap}>
      <View {...props} style={styles.bar}>
        {props.children}
      </View>
    </View>
  );
}
