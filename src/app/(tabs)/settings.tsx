import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useColors } from '@/hooks/use-colors';
import { fontFamily, spacing } from '@/constants/theme';
import { useSettingsStore } from '@/stores/settings';

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { username, theme, setUsername, setTheme } = useSettingsStore();
  const [editingName, setEditingName] = useState(username);

  const styles = React.useMemo(() => StyleSheet.create({
    container: { flex: 1 },
    scroll: { flex: 1, paddingHorizontal: spacing[6] },
    section: {
      marginTop: spacing[10],
      gap: spacing[4],
    },
    label: {
      letterSpacing: 1.2,
    },
    input: {
      backgroundColor: colors.surface.mid,
      color: colors.text.primary,
      fontFamily: fontFamily.sans,
      fontSize: 16,
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[4],
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface.low,
      paddingHorizontal: spacing[5],
      paddingVertical: spacing[4],
    },
    saveBtn: {
      alignSelf: 'flex-end',
      paddingVertical: spacing[2],
      paddingHorizontal: spacing[4],
    },
    divider: {
      height: 1,
      backgroundColor: colors.surface.highest,
      marginTop: spacing[10],
    },
  }), [colors]);

  const handleNameBlur = () => {
    const trimmed = editingName.trim();
    if (trimmed !== username) setUsername(trimmed);
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader title="Settings" />

      <View style={styles.scroll}>
        {/* Display name */}
        <View style={styles.section}>
          <ThemedText type="labelMd" color={colors.primary.default} style={styles.label}>
            PROFILE
          </ThemedText>
          <TextInput
            style={styles.input}
            placeholder="Display name"
            placeholderTextColor={colors.text.secondary}
            value={editingName}
            onChangeText={setEditingName}
            onBlur={handleNameBlur}
            onSubmitEditing={handleNameBlur}
            returnKeyType="done"
            autoCorrect={false}
          />
        </View>

        <View style={styles.divider} />

        {/* Appearance */}
        <View style={styles.section}>
          <ThemedText type="labelMd" color={colors.primary.default} style={styles.label}>
            APPEARANCE
          </ThemedText>
          <Pressable
            style={styles.row}
            onPress={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            <ThemedText type="bodyMd">Light Mode</ThemedText>
            <Switch
              value={theme === 'light'}
              onValueChange={(val) => setTheme(val ? 'light' : 'dark')}
              trackColor={{ false: colors.surface.highest, true: colors.primary.default }}
              thumbColor={colors.surface.low}
            />
          </Pressable>
        </View>
      </View>
    </ThemedView>
  );
}
