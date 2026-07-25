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

import { ThemedText } from '@/components/themed-text';
import { useColors } from '@/hooks/use-colors';
import { elevation, spacing } from '@/constants/theme';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
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

const TAB_BAR_PADDING_TOP = spacing[3];

function TabButton({
  children,
  isFocused,
  icon: Icon,
  featured = false,
  ...props
}: TabTriggerSlotProps & { icon?: LucideIcon; featured?: boolean }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const color = isFocused ? colors.primary.default : colors.text.secondary;
  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        tabButton: {
          flex: 1,
          alignItems: 'center',
          gap: spacing[1],
          paddingVertical: spacing[1],
        },
        label: {
          fontSize: 10,
          letterSpacing: 1.5,
        },
      }),
    [],
  );

  /**
   * The Compass cell is a plain tab until it's the active one. Only then does it
   * become architecturally different: side dividers and a gold top rule run the
   * full height of the bar, cancelling the bar's own padding so the frame reaches
   * both edges without moving the icon.
   */
  const bottomPad = Math.max(insets.bottom, spacing[2]);
  const showFrame = featured && isFocused;
  const frame = {
    backgroundColor: colors.surface.mid,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.outline.variant,
    borderRightColor: colors.outline.variant,
    borderTopWidth: 2,
    borderTopColor: colors.primary.default,
    marginTop: -TAB_BAR_PADDING_TOP,
    paddingTop: TAB_BAR_PADDING_TOP,
    marginBottom: -bottomPad,
    paddingBottom: bottomPad + spacing[1],
    ...elevation.card,
  };

  return (
    <Touchable {...props} style={showFrame ? [styles.tabButton, frame] : styles.tabButton}>
      {Icon && <Icon size={24} color={color} strokeWidth={2} />}
      <ThemedText type="labelSm" color={color} numberOfLines={1} style={styles.label}>
        {children}
      </ThemedText>
    </Touchable>
  );
}

function CustomTabBar(props: { children: React.ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        tabBar: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          backgroundColor: colors.surface.low,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.outline.variant,
          paddingTop: TAB_BAR_PADDING_TOP,
          paddingHorizontal: spacing[2],
        },
      }),
    [colors],
  );

  return (
    <View
      {...props}
      style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, spacing[2]) }]}
    >
      {props.children}
    </View>
  );
}
