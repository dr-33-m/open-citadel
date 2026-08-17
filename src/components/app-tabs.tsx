import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  type TabTriggerSlotProps,
} from 'expo-router/ui';
import {
  Compass,
  Library,
  MessageSquare,
  Settings,
  Timeline,
  type LucideIcon,
} from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Touchable } from '@/components/ui/touchable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/use-colors';
import { elevation, iconSize, spacing } from '@/constants/theme';

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
            <TabButton icon={Timeline}>TIMELINE</TabButton>
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
  const color = isFocused ? colors.primary.default : colors.text.secondary;
  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        tabButton: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: spacing[3],
        },
      }),
    [],
  );

  /**
   * The Compass cell is a plain tab until it's the active one. Only then does it
   * become architecturally different: side dividers and a gold top rule. The bar
   * row stretches every cell to its own height by default, so this frame just
   * has to paint its own background and borders — no padding tricks needed to
   * reach the bar's edges, unlike the old edge-to-edge bar which needed negative
   * margins to escape its own screen-level padding.
   */
  const showFrame = featured && isFocused;
  const frame = {
    backgroundColor: colors.surface.mid,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.outline.variant,
    borderRightColor: colors.outline.variant,
    borderTopWidth: 2,
    borderTopColor: colors.primary.default,
  };

  const label = typeof children === 'string' ? children : undefined;

  return (
    <Touchable
      {...props}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFocused }}
      style={showFrame ? [styles.tabButton, frame] : styles.tabButton}
    >
      {Icon && <Icon size={iconSize.nav} color={color} strokeWidth={2} />}
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
