import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  type TabTriggerSlotProps,
} from 'expo-router/ui';
import {
  Clock,
  Compass,
  Library,
  MessageSquare,
  Settings,
  type LucideIcon,
} from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Touchable } from '@/components/ui/touchable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useColors } from '@/hooks/use-colors';
import { spacing } from '@/constants/theme';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <CustomTabBar>
          <TabTrigger name="index" href="/" asChild>
            <TabButton icon={Clock}>TIMELINE</TabButton>
          </TabTrigger>
          <TabTrigger name="library" href="/library" asChild>
            <TabButton icon={Library}>LIBRARY</TabButton>
          </TabTrigger>
          <TabTrigger name="chat" href="/chat" asChild>
            <TabButton icon={MessageSquare}>CHAT</TabButton>
          </TabTrigger>
          <TabTrigger name="compass" href="/compass" asChild>
            <TabButton icon={Compass}>COMPASS</TabButton>
          </TabTrigger>
          <TabTrigger name="settings" href="/settings" asChild>
            <TabButton icon={Settings}>SETTINGS</TabButton>
          </TabTrigger>
        </CustomTabBar>
      </TabList>
    </Tabs>
  );
}

function TabButton({
  children,
  isFocused,
  icon: Icon,
  ...props
}: TabTriggerSlotProps & { icon?: LucideIcon }) {
  const colors = useColors();
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
          letterSpacing: 0.5,
        },
      }),
    [],
  );

  return (
    <Touchable {...props} style={styles.tabButton}>
      {Icon && <Icon size={20} color={color} strokeWidth={isFocused ? 2.4 : 1.8} />}
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
          paddingTop: spacing[3],
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
