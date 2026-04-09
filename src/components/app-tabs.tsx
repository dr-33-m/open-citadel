import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  type TabTriggerSlotProps,
} from 'expo-router/ui';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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
            <TabButton>TIMELINE</TabButton>
          </TabTrigger>
          <TabTrigger name="library" href="/library" asChild>
            <TabButton>LIBRARY</TabButton>
          </TabTrigger>
          <TabTrigger name="chat" href="/chat" asChild>
            <TabButton>CHAT</TabButton>
          </TabTrigger>
          <TabTrigger name="settings" href="/settings" asChild>
            <TabButton>SETTINGS</TabButton>
          </TabTrigger>
        </CustomTabBar>
      </TabList>
    </Tabs>
  );
}

function TabButton({
  children,
  isFocused,
  ...props
}: TabTriggerSlotProps) {
  const colors = useColors();
  const styles = React.useMemo(() => StyleSheet.create({
    tabButton: {
      alignItems: 'center',
      gap: spacing[2],
      paddingVertical: spacing[2],
    },
    activeIndicator: {
      width: 24,
      height: 2,
      backgroundColor: colors.primary.default,
    },
  }), [colors]);

  return (
    <Pressable {...props} style={styles.tabButton}>
      <ThemedText
        type="labelSm"
        color={isFocused ? colors.primary.default : colors.text.secondary}
      >
        {children}
      </ThemedText>
      {isFocused && <View style={styles.activeIndicator} />}
    </Pressable>
  );
}

function CustomTabBar(props: { children: React.ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => StyleSheet.create({
    tabBar: {
      flexDirection: 'row',
      backgroundColor: colors.surface.low,
      justifyContent: 'center',
      gap: spacing[8],
      paddingTop: spacing[4],
    },
  }), [colors]);

  return (
    <View
      {...props}
      style={[
        styles.tabBar,
        { paddingBottom: Math.max(insets.bottom, spacing[3]) },
      ]}
    >
      {props.children}
    </View>
  );
}
